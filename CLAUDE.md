# CLAUDE.md — ClawWork 项目指南

## 项目概述

ClawWork 是一个 OpenClaw 桌面客户端，体验对标 Claude Cowork：三栏布局、多任务并行、结构化进度追踪。在此基础上新增文件管理能力——所有 AI 产物自动落盘到本地 Git Repo，可搜索、可追溯。

**不是** OpenClaw 管理后台，**不是**通用 IM 客户端，**不是**多人协作工具。

## 架构

```
┌─────────────────────┐       ┌──────────────────────────┐
│ OpenClaw Server      │  WS   │ ClawWork Desktop App     │
│ (Node.js 进程)       │◄────►│ (Electron 34 进程)        │
│                     │       │                          │
│ ┌─────────────────┐ │       │  React 19 UI             │
│ │ Gateway :18789  │ │       │  SQLite (元数据索引)       │
│ │ Agent Engine    │ │       │  Git Repo (产物版本化)     │
│ │ ┌─────────────┐ │ │       │                          │
│ │ │ clawwork    │ │ │       └──────────────────────────┘
│ │ │ channel     │ │ │
│ │ │ plugin      │ │ │ ← 运行在 OpenClaw 内部
│ │ │ :13579      │ │ │    通过 jiti 加载 TS
│ │ └─────────────┘ │ │
│ └─────────────────┘ │
└─────────────────────┘
```

**两个进程，两个 WS 连接：**

1. Desktop → Gateway (:18789)：发送用户消息，接收 session 事件广播
2. Desktop → Plugin (:13579)：接收 Agent 的 sendText/sendMedia 回调推送

Channel Plugin 运行在 OpenClaw 进程里（不是 Electron 里）。它告诉 OpenClaw："Agent 发消息时，通过 WS 推给 ClawWork App"。

## Monorepo 结构

```
./
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json        # ES2022, strict, bundler resolution
├── packages/
│   ├── shared/               # @clawwork/shared — 零依赖类型桥梁
│   │   └── src/
│   │       ├── types.ts      # Task, Message, Artifact, ToolCall, ProgressStep
│   │       ├── protocol.ts   # WsMessage 联合类型 + type guards
│   │       ├── gateway-protocol.ts  # GatewayFrame 类型, GatewayConnectParams
│   │       ├── constants.ts  # 端口号, buildSessionKey(), parseTaskIdFromSessionKey()
│   │       └── index.ts      # barrel export
│   ├── channel-plugin/       # openclaw-channel-clawwork — OpenClaw 插件
│   │   ├── openclaw.plugin.json
│   │   └── src/index.ts      # register() → WS server + outbound adapter (骨架)
│   └── desktop/              # @clawwork/desktop — Electron 应用
│       ├── electron.vite.config.ts  # React + Tailwind v4 vite plugin
│       └── src/
│           ├── main/
│           │   ├── index.ts         # Electron 主进程, hiddenInset titleBar
│           │   ├── ws/
│           │   │   ├── gateway-client.ts  # GatewayClient: challenge-response auth, heartbeat, reconnect
│           │   │   ├── plugin-client.ts   # PluginClient: Channel Plugin WS 连接
│           │   │   └── index.ts           # initWebSockets, getters, destroy
│           │   └── ipc/
│           │       └── ws-handlers.ts     # IPC handlers: send-message, chat-history, list-sessions, gateway-status
│           ├── preload/
│           │   ├── index.ts         # buildApi() factory, contextBridge
│           │   └── clawwork.d.ts    # ClawWorkAPI interface
│           └── renderer/
│               ├── index.html
│               ├── main.tsx         # React 入口
│               ├── App.tsx          # 三栏布局 (260px | flex | 320px)
│               ├── stores/
│               │   ├── taskStore.ts     # Task CRUD, activeTaskId
│               │   ├── messageStore.ts  # messagesByTask, streamingByTask
│               │   └── uiStore.ts       # rightPanelOpen, unreadTaskIds
│               ├── styles/
│               │   ├── theme.css            # Tailwind v4 + CSS Variables + Inter/JetBrains Mono
│               │   └── design-tokens.ts     # TS 设计令牌 (colors, spacing, motion presets)
│               ├── lib/
│               │   └── utils.ts             # cn(), formatRelativeTime(), formatFileSize()
│               ├── components/
│               │   ├── ui/                  # shadcn/ui 基础组件 (Button, ScrollArea, Tabs, etc.)
│               │   ├── ChatMessage.tsx      # Markdown 渲染 + motion.div listItem
│               │   ├── ChatInput.tsx        # Button + motion, Enter/Shift+Enter
│               │   ├── StreamingMessage.tsx  # motion.div fadeIn + cursor 动画
│               │   ├── ToolCallCard.tsx     # Radix Collapsible + AnimatePresence
│               │   ├── ContextMenu.tsx      # useTaskContextMenu hook (组件已移除)
│               │   ├── FileCard.tsx         # motion.button 文件卡片
│               │   └── FilePreview.tsx      # 文件预览面板
│               ├── hooks/
│               │   └── useGatewayDispatcher.ts  # Gateway chat 事件 → stores
│               └── layouts/
│                   ├── LeftNav/     # TaskItem 提取, DropdownMenu 右键菜单, Tooltip
│                   ├── MainArea/    # AnimatePresence 视图切换, 欢迎屏
│                   ├── RightPanel/  # Tabs (Progress/Artifacts/Git), ScrollArea
│                   ├── FileBrowser/ # 文件浏览器 + AnimatePresence 预览
│                   ├── Settings/    # 设置页面
│                   └── Setup/       # 初始化引导页
```

### 包间依赖

```
@clawwork/shared ← 被其他两个包引用
     ↑       ↑
     │       │
channel-plugin  @clawwork/desktop
```

`@clawwork/shared` 的 tsconfig 启用了 `composite: true`，desktop 通过 `references` 引用它。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron 34 + electron-vite 3 |
| 前端 | React 19, TypeScript 5.x, Tailwind CSS v4 |
| UI 组件 | shadcn/ui (Radix UI + cva + tailwind-merge) |
| 动画 | Framer Motion |
| 字体 | Inter Variable (UI) + JetBrains Mono (代码) |
| 状态管理 | Zustand 5 |
| 数据库 | better-sqlite3 + Drizzle ORM |
| Git 操作 | simple-git |
| 图标 | lucide-react |
| 构建 | Vite 6 (via electron-vite) |
| 打包 | electron-builder (macOS Universal Binary) |
| 包管理 | pnpm 10 workspace |

## 开发命令

```bash
# 安装所有依赖
pnpm install

# 开发 Desktop App（Electron 热更新）
pnpm --filter @clawwork/desktop dev

# 类型检查（注意：tsc 只在 desktop/node_modules 下，pnpm exec tsc 不可用）
# 必须先 build shared（composite: true），再 check desktop
packages/desktop/node_modules/.bin/tsc -b packages/shared/tsconfig.json
packages/desktop/node_modules/.bin/tsc --noEmit -p packages/desktop/tsconfig.json
packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json

# 将 Channel Plugin symlink 安装到 OpenClaw（开发模式）
openclaw plugins install -l ./packages/channel-plugin

# 打包
pnpm --filter @clawwork/desktop build
```

## 关键协议

### Session Key 格式

```
agent:<agentId>:task-<taskId>
```

每个 Task 对应一个独立的 OpenClaw session。session 间并行执行，session 内串行。Gateway 广播所有 session 事件（不过滤），客户端按 sessionKey 路由到对应 Task。

### WebSocket 消息类型 (packages/shared/src/protocol.ts)

**Plugin → Desktop（Agent 出站）：**

| type | 用途 |
|---|---|
| `text` | Agent 文本回复 |
| `media` | Agent 生成文件 (mediaPath) |
| `tool_call` | 工具调用状态更新 |
| `stream_chunk` | 流式响应片段 |

**Desktop → Plugin（用户入站）：**

| type | 用途 |
|---|---|
| `user_message` | 用户发送消息 |
| `create_session` | 创建新 session |

**双向：**

| type | 用途 |
|---|---|
| `heartbeat` | 心跳 (30s 间隔) |
| `error` | 错误通知 |

### 文件传输

MVP 只做同机部署：`sendMedia()` 通过 WS 发送 `mediaPath`（本地文件路径），Desktop 复制到 Task 产物目录。

注意 `mediaLocalRoots` 安全校验（v2026.3.2+），plugin 必须正确传播该参数。

## 主题系统

CSS Variables 驱动，dark 为默认。切换方式：`<html data-theme="dark|light">`。

核心色值：accent green `#0FFD0D`（dark）/ `#0B8A0A`（light），背景 `#1C1C1C` / `#FAFAFA`。

所有颜色通过 `var(--xxx)` 引用，不硬编码。

## 当前进度

### Phase 1 — 已完成 ✅ (commits `375154c`, `c882b4e`)

- **T1-0** Monorepo 骨架 (pnpm workspace, tsconfig, .gitignore, git init)
- **T1-1** Desktop 包 (Electron main, preload, renderer 入口, theme CSS)
- **T1-2** Channel Plugin (register(), WS server, sendText/sendMedia outbound adapter)
- **T1-3** Shared 类型 (types.ts, protocol.ts, gateway-protocol.ts, constants.ts) — Drizzle ORM schema 待做
- **T1-4** 三栏布局 (App.tsx: 260px LeftNav | flex MainArea | 320px RightPanel, 右侧可折叠)
- **T1-5** LeftNav 静态结构 (新任务按钮, 搜索框, 文件管理入口, 示例任务列表, 设置)
- **T1-7** Electron 主进程 WS 客户端：Gateway challenge-response 认证、心跳、指数退避重连
- **T1-8** 消息发送：Electron → Gateway (chat.send)，含 idempotencyKey
- **T1-9** 消息接收：Gateway 事件通过 IPC 转发到 renderer，useAgentMessages hook 按 sessionKey 路由

**Phase 1 验收标准已达成：在 Electron DevTools 中通过 `window.clawwork.sendMessage()` 与 Agent 完成一轮对话，事件正确回传。**

### Phase 2 — 已完成 ✅ (commit `bc220ad`)

- **T2-0** 安装 zustand, react-markdown, rehype-highlight
- **T2-1** New Task 流程：taskStore.createTask()，创建任务并自动设为 active
- **T2-2** 任务列表渲染：动态读取 taskStore，按状态分组 (Active → Completed → Archived)，按创建时间倒序
- **T2-3** 右键菜单：ContextMenu 组件 + useTaskContextMenu hook，状态流转 active→completed→archived
- **T2-4** ChatMessage 组件：Markdown 渲染 (react-markdown + rehype-highlight)，用户/助手/系统角色区分
- **T2-5** ChatInput 组件：Shift+Enter 换行，Enter 发送，textarea 自动伸缩高度
- **T2-6** StreamingMessage 组件：流式响应 delta 累加 + 光标闪烁动画
- **T2-7** ToolCallCard 组件：可折叠工具调用卡片，显示 arguments/result
- **T2-8** Progress 面板：从 AI 消息中提取 `- [x]`/`- [ ]` 模式，显示进度步骤
- **T2-9** Artifacts 面板：从消息的 artifacts 字段列出文件产物
- **Bug fix** Zustand selector 无限循环：移除 store 中的 getter 方法，改为直接 state 访问 + EMPTY_MESSAGES 哨兵值
- **Bug fix** Gateway chat 事件解析：content 位于 `payload.message.content[]`，不是 `payload.content[]`
- **Preload 重构** buildApi() 工厂函数，修复类型错误

### 延后

- **T1-6** Channel Plugin 完善：Gateway 单通道已能完成完整对话，Plugin WS 通道延后
- **T2-10** 多任务并行验证：功能已就绪，但未做系统性测试

### Phase 3 — 已完成 ✅ (commit `TBD`)

- **T3-1** Workspace 配置持久化：`app.getPath('userData')/clawwork-config.json`，Setup 引导页
- **T3-2** SQLite 数据库初始化：`better-sqlite3`，tasks/messages/artifacts 表，DB 文件在 `<workspacePath>/.clawwork.db`
- **T3-3** 产物落盘：artifact 文件复制到 workspace，DB 记录，Git auto-commit (simple-git)
- **T3-4** 文件浏览器 UI：FileBrowser 布局，FileCard 组件，搜索+筛选+类型分组
- **T3-5** 文件预览面板：FilePreview 组件，代码/文本/图片预览
- **T3-6** IPC 层：workspace/artifact/settings IPC handlers

### Phase 3.5 — 已完成 ✅ (待提交)

Design System + UI 全面重构：shadcn/ui + Framer Motion + Inter/JetBrains Mono 字体

- **T3.5-0** 安装依赖：framer-motion, cva, Radix UI 全家桶, @fontsource-variable/*
- **T3.5-1** 设计系统定义：`design-system.md` 规范 + `design-tokens.ts` TS 常量 + shadcn/ui 基础组件
- **T3.5-2** 基础层重构：theme.css 重写（字体导入, @layer base, 扩展 CSS 变量）
- **T3.5-3** 组件重构：ChatMessage, ChatInput, StreamingMessage, ToolCallCard, FileCard, FilePreview 全部用 shadcn/ui + motion 重写
- **T3.5-4** 布局重构：LeftNav (TaskItem 提取 + DropdownMenu), MainArea (AnimatePresence), RightPanel (Tabs), FileBrowser, Settings, Setup, App.tsx (TooltipProvider)
- **T3.5-5** 清理：删除 useAgentMessages.ts 死代码
- **T3.5-6** 验证通过：tsc --noEmit 零错误，dev server 正常启动，UI 截图确认渲染正确

### Phase 3.5 Visual Polish — 已完成 ✅ (待提交)

**Font/Size Bump (13 files):**
- **T3.5-7** 基础字体 13→14px, avatar/icon/button 尺寸放大, 圆角统一, section labels text-xs, Button danger variant hex→CSS vars

**Premium Depth Pass (10 items, all verified):**
- **T3.5-8** theme.css 新增 12 个 premium CSS Variables（dark+light）: `--accent-hover`, `--accent-soft`, `--accent-soft-hover`, `--bg-elevated`, `--ring-accent`, `--glow-accent`, `--shadow-elevated`, `--shadow-card`, `--border-subtle`, `--danger`, `--danger-bg`
- **T3.5-9** 3 个 CSS utility classes: `.surface-elevated`, `.glow-accent`, `.ring-accent-focus`
- **T3.5-10** button.tsx: 新增 `soft` variant + 所有 variants `active:scale-[0.98]` + focus ring `--ring-accent`
- **T3.5-11** ChatInput: `--bg-elevated` + `--shadow-elevated` + `ring-accent-focus`, send button → `soft` variant
- **T3.5-12** MainArea WelcomeScreen: radial glow + subtitle + typography hierarchy
- **T3.5-13** LeftNav "新任务" button: `default` → `soft` variant
- **T3.5-14** TaskItem: active 左侧 3px accent bar + `whileHover={{ x: 2 }}` 微交互
- **T3.5-15** ToolCallCard: 左侧状态条 (running=pulse, done=accent, error=red) + shadow-card
- **T3.5-16** tabs.tsx: 尺寸放大, active 使用 `--bg-elevated` + `--shadow-card`
- **T3.5-17** dropdown-menu.tsx: 硬编码颜色 → CSS Variables, content 使用 `--bg-elevated` + `--shadow-elevated`
- **T3.5-18** Setup 页面: radial glow + elevated card form container

### 后续 Phase 概览

- **Phase 4** — 打磨+打包 (T4-1 ~ T4-7): 主题切换、全局搜索 (FTS5)、Settings、错误处理、electron-builder dmg

## 任务依赖图

```
Phase 1:
  T1-0 → T1-1 ─────┐
         T1-2 ─────┤→ T1-6 → T1-7 → T1-8 → T1-9
         T1-3 ─────┘
         T1-4 ─┬→ (Phase 2 UI 依赖)
         T1-5 ─┘

Phase 2:
  [T2-1 → T2-2 → T2-3]   Task CRUD 链路（串行）
  [T2-4 → T2-5 → T2-6 → T2-7]   对话流组件（串行）
  [T2-8, T2-9]   右侧面板（可并行）
  T2-10   多任务验证（所有 Phase 2 完成后）

Phase 3:
  [T3-1 → T3-2 → T3-3]   产物落盘（串行）
  [T3-4 → T3-5 → T3-6 → T3-7]   文件浏览器（串行）
  两条线可并行

Phase 4:
  [T4-1, T4-2, T4-3, T4-4]   全部可并行
  T4-5 → T4-6 → T4-7   打包链路（串行）
```

## 技术发现（踩坑记录）

### Gateway 协议关键细节

1. **Challenge-response 认证**：服务端先发 `connect.challenge`（含 nonce），客户端必须回复 `connect` 请求（protocol=3, client.id=`gateway-client`, mode=`backend`）
2. **`chat.send` 参数**：`sessionKey` + `message`（不是 `text`）+ `idempotencyKey`（UUID）。返回 `{runId, status: "started"}`，非阻塞
3. **Chat event payload 结构（关键坑）**：内容在 `payload.message.content[]`，不是 `payload.content[]`。这是 Phase 2 消息不显示的根因
4. **Preload 路径**：electron-vite 输出 preload 为 `.mjs`（不是 `.js`），主进程加载路径需对应
5. **`@clawwork/shared` 不能 externalize**：在 electron-vite 配置中必须 bundle 进去

### Zustand 陷阱

**禁止在 selector 中调用 `get()`**。`useStore((s) => s.someMethod())` 其中 `someMethod` 内部调用 `get()` 会导致无限重渲染（每次返回新对象引用）。解法：直接访问 state 字段 + 模块级 `const EMPTY_ARRAY: T[] = []` 哨兵值避免空数组引用变化。

### Gateway 完整协议参考

详细协议文档已存储在 `~/.agents/memories/-Users-x-git-samzong-clawwork/gateway-ws-protocol.md`，包含：帧格式、连接握手、有效 client ID/mode 枚举、RPC 方法列表、事件类型、chat 消息结构、可用 Agent 列表。

### Tailwind v4 `@layer` 优先级陷阱

Tailwind v4 将所有 utility classes 输出到 `@layer utilities` 中。根据 CSS 规范，**unlayered 样式的优先级永远高于任何 `@layer` 内的样式**——无论选择器特异性如何。

因此，如果在 `theme.css`（`@import "tailwindcss"` 所在文件）中写了 unlayered 的全局 reset：

```css
/* 错误：这会覆盖所有 Tailwind padding/margin utilities */
* { margin: 0; padding: 0; box-sizing: border-box; }
```

则 `pt-14`、`px-4`、`pb-3` 等 **所有** padding/margin utility 都会被覆盖为 0px，完全无效。

**解法：** 删掉这段 reset。Tailwind v4 Preflight（`@layer base`）已经包含了 `* { margin: 0; padding: 0; box-sizing: border-box }`，不需要重复。如果必须写自定义 base 样式，用 `@layer base { ... }` 包裹。

### Electron 自动截图排障方法

开发模式下 `main/index.ts` 自动在 `did-finish-load` 后截图到 `/tmp/clawwork-screenshot.png`，也支持 `Cmd+Shift+S` 手动触发。当截图看起来没变化时，不要反复重启——用 `executeJavaScript` 注入诊断脚本 dump `getComputedStyle()` 到 `/tmp/clawwork-debug.json`，直接确认 CSS 是否生效。

## 已知问题与风险

| 问题 | 影响 | 参考 |
|---|---|---|
| Gateway 协议文档不完整 | 需要读源码反推 | 参考 feishu/dingtalk plugin |
| Channel ID 校验 bug | 自定义 channel 启动可能报错 | [#12484](https://github.com/openclaw/openclaw/issues/12484) |
| Gateway 广播无 session 过滤 | 客户端需自行按 sessionKey 过滤 | [#32579](https://github.com/openclaw/openclaw/issues/32579) |
| `mediaLocalRoots` 安全校验 | 文件发送可能被拒 | [#20258](https://github.com/openclaw/openclaw/issues/20258), [#36477](https://github.com/openclaw/openclaw/issues/36477) |
| Session 4AM 自动重置 | 长期 Task 上下文被清 | Plugin 需配置禁用自动重置 |

## 编码约定

- TypeScript strict 模式，不允许 `any`（plugin 的 `api` 参数除外，OpenClaw 无类型定义）
- 所有颜色使用 CSS Variables，不硬编码 hex
- 组件文件放 `layouts/` (布局组件) 或 `components/` (通用组件)，按功能目录组织
- 状态管理用 Zustand，每个 domain 一个 store（`taskStore`, `messageStore`, `uiStore`）
- WebSocket 消息类型统一在 `@clawwork/shared/src/protocol.ts` 定义，两端共享

## 设计文档

- 完整设计文档见仓库外的 `openclaw-desktop-design.md`（v0.2），包含数据模型、UI 原型、ADR、28 个开发任务的完整描述和验收标准。
- 设计系统规范见仓库内 `design-system.md`，包含色彩、字体、间距、圆角、阴影、动效、组件状态的完整定义。
