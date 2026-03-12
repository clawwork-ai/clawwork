# HANDOFF.md — ClawWork 项目交接文档

> 面向接手的开发者（包括 AI 编码工具）。
> 最后更新：2026-03-12

---

## 1. 这是什么项目

ClawWork 是一个 **OpenClaw 桌面客户端**（Electron 应用）。体验对标 Claude Cowork：

- **三栏布局**：左侧任务列表 | 中间对话流 | 右侧进度/产物面板
- **多任务并行**：多个 Task 同时执行，互不干扰
- **文件管理**：AI 产物自动落盘到本地 Git Repo，可搜索、可追溯

**不是** OpenClaw 管理后台。**不是**通用聊天工具。**不是**多人协作工具。单用户桌面工具。

## 2. 当前状态总览

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 项目骨架 + OpenClaw WS 通信 | 已完成 (已提交) |
| Phase 2 | Task CRUD + 对话 UI + 右侧面板 | 已完成 (已提交) |
| Phase 3 | 产物落盘 + 文件浏览器 | 已完成 (**未提交**) |
| Phase 3.5 | Design System + UI 全面重构 + Premium Depth | 已完成 (**未提交**) |
| Phase 4 | 主题切换、全局搜索、打包分发 | **未开始** |

**Phase 3 和 Phase 3.5 的代码已全部完成并通过验证（tsc 零错误 + dev server 正常），但尚未 git commit。**

### 应用目前能做的

- 通过 WebSocket 连接 OpenClaw Gateway（challenge-response 认证、心跳、断线重连）
- 创建多个 Task（每个对应独立的 OpenClaw session），并行执行
- 发送消息给 AI Agent，接收流式响应，Markdown 渲染 + 代码高亮
- 工具调用折叠卡片（可展开看参数/结果）
- 从 AI 响应提取进度步骤（`- [x]`/`- [ ]` 模式）
- 产物面板列出当前 Task 的文件
- Setup 引导页：首次启动选择 workspace 目录
- SQLite 数据库（better-sqlite3 + Drizzle ORM），持久化 tasks/messages/artifacts
- 产物落盘：AI 生成的文件复制到 workspace + Git auto-commit
- 文件浏览器：按类型筛选、搜索、点击跳转到来源消息
- 文件预览：Markdown/代码/图片 inline 预览
- 完整设计系统：shadcn/ui + Framer Motion 动画 + Premium depth 效果

### 还不能做的（Phase 4）

- 主题切换（dark/light CSS Variables 已定义，UI 切换开关未实现）
- 全局搜索（SQLite FTS5）
- Settings 页面（服务器地址、workspace 路径的修改）
- 错误处理 + 断线重连 UI 提示
- electron-builder 打包分发（macOS dmg）

## 3. 如何运行

### 前置条件

- Node.js 20+
- pnpm 10+
- 一个正在运行的 OpenClaw Server（localhost:18789）

### 开发命令

```bash
# 安装依赖
pnpm install

# 启动开发模式（Electron 热更新）
pnpm --filter @clawwork/desktop dev

# 类型检查（⚠️ 重要：tsc 只在 desktop/node_modules 下）
# 必须先 build shared（composite: true），再 check desktop
packages/desktop/node_modules/.bin/tsc -b packages/shared/tsconfig.json
packages/desktop/node_modules/.bin/tsc --noEmit -p packages/desktop/tsconfig.json
packages/desktop/node_modules/.bin/tsc --noEmit -p packages/channel-plugin/tsconfig.json

# 打包
pnpm --filter @clawwork/desktop build
```

**类型检查注意**：`pnpm exec tsc` 不可用（tsc 不在 root node_modules），必须用 `packages/desktop/node_modules/.bin/tsc`。

**shared 包是 `composite: true`**：修改 shared 类型后必须先运行 `tsc -b packages/shared/tsconfig.json` 生成 `.d.ts`，否则 desktop 看不到新导出。

### Gateway 连接

应用会连接 `ws://localhost:18789`，使用硬编码 token `38d7f008d24a0b508a0ef7149a18bba3ab6ee0bfe5b6f4b9`（定义在 `gateway-client.ts`）。

## 4. 项目结构

```
clawwork/
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json        # ES2022, strict, bundler resolution
├── CLAUDE.md                 # 项目指南 + 进度追踪 + 踩坑记录
├── HANDOFF.md                # 本文件
├── design-system.md          # 设计系统规范
├── openclaw-desktop-design.md # 完整设计文档（数据模型、UI 原型、任务列表）
├── eui.md                    # UI/UX 升级指令（只读参考）
└── packages/
    ├── shared/               # @clawwork/shared — 零依赖类型桥梁
    ├── channel-plugin/       # openclaw-channel-clawwork — OpenClaw 插件（骨架，暂未使用）
    └── desktop/              # @clawwork/desktop — Electron 应用（主体代码在这里）
```

### 包间依赖

```
@clawwork/shared ← 被其他两个包引用
     ↑       ↑
     │       │
channel-plugin  @clawwork/desktop
```

## 5. 文件详细地图

### Shared 类型 (`packages/shared/src/`)

| 文件 | 作用 |
|------|------|
| `types.ts` | `Task`, `Message`, `Artifact`, `ToolCall`, `ProgressStep` 类型定义 |
| `protocol.ts` | `WsMessage` 联合类型 + type guards（Plugin ↔ Desktop 消息格式） |
| `gateway-protocol.ts` | `GatewayFrame` 类型, `GatewayConnectParams`（Gateway WS 协议） |
| `constants.ts` | 端口号, `buildSessionKey()`, `parseTaskIdFromSessionKey()` |
| `index.ts` | barrel export |

### 主进程 (`packages/desktop/src/main/`)

| 文件 | 作用 |
|------|------|
| `index.ts` | Electron 生命周期, 窗口创建 (hiddenInset titleBar), IPC + WS 初始化, 开发模式自动截图 |
| `ws/gateway-client.ts` | `GatewayClient`: challenge-response 认证, 心跳(30s), 指数退避重连, `sendChatMessage()`, 事件通过 IPC 转发 |
| `ws/plugin-client.ts` | `PluginClient`: Channel Plugin WS 连接（当前未使用，Gateway 直连已足够） |
| `ws/index.ts` | `initWebSockets()`, getters, `destroy()` |
| `ipc/ws-handlers.ts` | IPC: `ws:send-message`, `ws:chat-history`, `ws:list-sessions`, `ws:gateway-status` |
| `ipc/workspace-handlers.ts` | IPC: workspace 配置读写, 初始化 |
| `ipc/artifact-handlers.ts` | IPC: 产物保存/列表/获取/文件读取 |
| `db/index.ts` | SQLite 数据库初始化 (better-sqlite3, WAL 模式) |
| `db/schema.ts` | Drizzle ORM schema: tasks, messages, artifacts 表 |
| `artifact/save.ts` | `saveArtifact()`: 文件复制到 workspace + DB insert |
| `artifact/git.ts` | `commitArtifact()`: simple-git add + commit |
| `workspace/config.ts` | 配置文件读写 (`app.getPath('userData')/clawwork-config.json`) |
| `workspace/init.ts` | workspace 目录初始化: mkdir + git init + .gitignore |

### Preload (`packages/desktop/src/preload/`)

| 文件 | 作用 |
|------|------|
| `index.ts` | `buildApi()` 工厂函数, 通过 `contextBridge` 暴露 `ClawWorkAPI` |
| `clawwork.d.ts` | `window.clawwork` 的 TypeScript 接口定义 |

### 渲染进程 (`packages/desktop/src/renderer/`)

#### 入口 + 根组件

| 文件 | 作用 |
|------|------|
| `index.html` | HTML 入口 |
| `main.tsx` | React 入口 |
| `App.tsx` | 三栏布局 (260px LeftNav \| flex MainArea \| 320px RightPanel), TooltipProvider, 挂载 `useGatewayEventDispatcher` |

#### 状态管理 (`stores/`)

| 文件 | 作用 |
|------|------|
| `taskStore.ts` | Task CRUD, `activeTaskId`, 任务列表按状态分组 |
| `messageStore.ts` | `messagesByTask`, `streamingByTask`, `EMPTY_MESSAGES` 哨兵值 |
| `uiStore.ts` | `rightPanelOpen`, `unreadTaskIds`, `currentView` |
| `fileStore.ts` | 文件浏览器数据 |

#### 样式 (`styles/`)

| 文件 | 作用 |
|------|------|
| `theme.css` | Tailwind v4 + CSS Variables (dark/light), @fontsource 字体导入, Premium depth tokens, utility classes |
| `design-tokens.ts` | TypeScript 设计令牌: colors, spacing, radius, typography, shadows, transitions, motion presets (fadeIn, slideUp, slideIn, scale, listItem) |

#### 通用组件 (`components/`)

| 文件 | 作用 |
|------|------|
| `ChatMessage.tsx` | 消息气泡: user/assistant/system 角色, Markdown 渲染 (react-markdown + rehype-highlight), motion.div listItem |
| `ChatInput.tsx` | 输入框: Shift+Enter 换行, Enter 发送, textarea 自动伸缩, `--bg-elevated` + `ring-accent-focus` |
| `StreamingMessage.tsx` | 流式响应: delta 累加 + 光标闪烁动画, motion.div fadeIn |
| `ToolCallCard.tsx` | 工具调用卡片: Radix Collapsible + AnimatePresence, 左侧状态条 (running/done/error), shadow-card |
| `FileCard.tsx` | 文件卡片: motion.button, 图标+文件名+日期+Task名 |
| `FilePreview.tsx` | 文件预览: Markdown/代码高亮/图片, ScrollArea |
| `ContextMenu.tsx` | 右键菜单 hook (组件本身已移除, 逻辑在 LeftNav 中) |

#### shadcn/ui 基础组件 (`components/ui/`)

| 文件 | 作用 |
|------|------|
| `button.tsx` | cva Button: variants (default, soft, ghost, outline, danger), sizes (sm, default, lg, icon), `active:scale-[0.98]` |
| `scroll-area.tsx` | Radix ScrollArea |
| `tabs.tsx` | Radix Tabs, active 使用 `--bg-elevated` + `--shadow-card` |
| `dropdown-menu.tsx` | Radix DropdownMenu, `--bg-elevated` + `--shadow-elevated`, danger 项用 `--danger` |
| `collapsible.tsx` | Radix Collapsible |
| `tooltip.tsx` | Radix Tooltip |

#### Hooks (`hooks/`)

| 文件 | 作用 |
|------|------|
| `useGatewayDispatcher.ts` | Gateway chat 事件 → stores 分发, 解析 `payload.message.content[]` |

#### 布局组件 (`layouts/`)

| 目录 | 文件 | 作用 |
|------|------|------|
| `LeftNav/` | `index.tsx` | 左侧导航: 新任务按钮(soft), 搜索框, Files 入口, 任务列表(按状态分组+时间倒序), Settings |
| `LeftNav/` | `TaskItem.tsx` | 单个任务条目: active 左侧 3px accent bar, DropdownMenu 右键菜单, `whileHover={{ x: 2 }}` |
| `MainArea/` | `index.tsx` | 中间区域: AnimatePresence 视图切换, 欢迎屏(radial glow), 对话流, 文件浏览器 |
| `RightPanel/` | `index.tsx` | 右侧面板: Tabs (Progress/Artifacts/Git), ScrollArea |
| `FileBrowser/` | `index.tsx` | 文件浏览器: 搜索+筛选+网格, AnimatePresence 预览面板 |
| `Settings/` | `index.tsx` | 设置页面 |
| `Setup/` | `index.tsx` | 初始化引导页: workspace 选择, radial glow + elevated card |

#### 工具 (`lib/`)

| 文件 | 作用 |
|------|------|
| `utils.ts` | `cn()` (clsx + tailwind-merge), `formatRelativeTime()`, `formatFileSize()` |

## 6. 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron 34 + electron-vite 3 |
| 前端 | React 19 + TypeScript 5.x + Tailwind CSS v4 |
| UI 组件 | shadcn/ui (Radix UI + cva + tailwind-merge) |
| 动画 | Framer Motion |
| 字体 | Inter Variable (UI) + JetBrains Mono (代码) |
| 状态管理 | Zustand 5 |
| 数据库 | better-sqlite3 + Drizzle ORM |
| Git 操作 | simple-git |
| 图标 | lucide-react |
| Markdown | react-markdown + rehype-highlight |
| 构建 | Vite 6 (via electron-vite) |
| 打包 | electron-builder (macOS Universal Binary) |
| 包管理 | pnpm 10 workspace |

## 7. 编码约定（必读）

### TypeScript

- **strict 模式**，不允许 `any`（plugin 的 `api` 参数除外，OpenClaw 无类型定义）
- 文件长度 **不超过 200 行**（硬性约束）
- 每个目录文件数 **不超过 8 个**，超过则拆子目录

### CSS / 样式

- **所有颜色使用 CSS Variables**（`var(--xxx)`），绝不硬编码 hex 值
- 主题切换方式：`<html data-theme="dark|light">`，dark 为默认
- 品牌色 accent green：`#0FFD0D`（dark）/ `#0B8A0A`（light）
- 使用 `cn()` 工具函数合并 Tailwind classes（支持条件 class）
- Tailwind v4 的 utility 在 `@layer utilities` 中，自定义 base 样式**必须**放在 `@layer base {}` 内（否则会覆盖所有 Tailwind utilities）

### 组件

- 布局组件放 `layouts/`（按功能目录组织），通用组件放 `components/`
- shadcn/ui 基础组件放 `components/ui/`
- 动画使用 `design-tokens.ts` 中的 motion presets（`fadeIn`, `slideUp`, `slideIn`, `scale`, `listItem`）
- 每个交互元素必须实现完整状态：default / hover / active / focused / disabled

### 状态管理

- 每个 domain 一个 Zustand store（`taskStore`, `messageStore`, `uiStore`, `fileStore`）
- **禁止在 Zustand selector 中调用 `get()`**（会导致无限重渲染）
- 空数组使用模块级哨兵值 `const EMPTY_ARRAY: T[] = []`，避免每次渲染创建新引用

### 协议

- WS 消息类型统一在 `@clawwork/shared/src/protocol.ts` 定义
- Session key 格式：`agent:<agentId>:task-<taskId>`
- 每个 Task 对应独立的 OpenClaw session

## 8. 关键踩坑记录

### 8.1 Gateway Chat 事件 Payload

消息内容在 `payload.message.content[]`，**不是** `payload.content[]`。

```json
{
  "type": "event",
  "event": "chat",
  "payload": {
    "sessionKey": "agent:main:task-<uuid>",
    "state": "delta",
    "message": {
      "role": "assistant",
      "content": [{ "type": "text", "text": "..." }]
    }
  }
}
```

`content` 是数组，支持三种 block：`text`、`thinking`、`toolCall`。

### 8.2 Zustand Selector 无限循环

```typescript
// 错误 — 每次渲染返回新对象引用，触发无限循环
useStore((s) => s.getMessages(taskId))

// 正确 — 直接访问 state 字段
useStore((s) => s.messagesByTask[taskId] ?? EMPTY_MESSAGES)
```

### 8.3 Tailwind v4 @layer 优先级

CSS 规范：**unlayered 样式优先级永远高于 `@layer` 内的样式**。Tailwind v4 的 utilities 都在 `@layer utilities` 中。

如果在 theme.css 写了不带 `@layer` 的 `* { padding: 0; }`，会让所有 `pt-14`、`px-4` 等 utility 失效。

Tailwind v4 Preflight 已包含 reset，不需要重复。自定义 base 样式**必须**用 `@layer base {}` 包裹。

### 8.4 electron-vite Preload 路径

electron-vite 输出 preload 为 `.mjs`（不是 `.js`），主进程加载路径需对应。

### 8.5 @clawwork/shared 不能 externalize

在 `electron.vite.config.ts` 中，`@clawwork/shared` 必须 bundle 进去（不能 externalize）。`externalizeDepsPlugin` 默认会外部化所有 `dependencies`，但 shared 通过 workspace 引用，需要打包。

### 8.6 Gateway 认证

Protocol version = 3，client.id = `gateway-client`，mode = `backend`。收到 `connect.challenge` 后的第一帧必须是 `connect` 请求，否则连接被关闭。

### 8.7 主进程相对导入需要 `.js` 扩展名

主进程代码中的相对导入需要带 `.js` 后缀（ESM 规范）。

### 8.8 Electron 截图 Debug

开发模式下 `main/index.ts` 在 `did-finish-load` + 2s 后自动截图到 `/tmp/clawwork-screenshot.png`，也支持 `Cmd+Shift+S` 手动触发。调试 CSS 问题时，可通过 `executeJavaScript` 注入脚本 dump `getComputedStyle()` 到 `/tmp/clawwork-debug.json`。

## 9. 设计系统速查

### 核心 CSS Variables

**基础色**：`--bg-primary` (#1C1C1C dark), `--bg-secondary` (#242424), `--bg-tertiary` (#2A2A2A), `--accent` (#0FFD0D), `--text-primary`, `--text-secondary`, `--border`

**Premium depth tokens**（Phase 3.5 新增）：
- `--bg-elevated`: 抬升表面背景（卡片、dropdown、active tab）
- `--shadow-elevated`: 抬升表面阴影
- `--shadow-card`: 卡片阴影
- `--accent-soft` / `--accent-soft-hover`: 柔和 accent 背景（soft button）
- `--ring-accent`: 焦点环颜色
- `--glow-accent`: 径向光晕颜色
- `--danger` / `--danger-bg`: 危险状态颜色
- `--border-subtle`: 细微边框

### Button Variants

| Variant | 用途 | 外观 |
|---------|------|------|
| `default` | 主 CTA | accent 全填充 |
| `soft` | 次要 CTA（新任务、发送按钮） | accent-soft 背景 + accent 文字 |
| `ghost` | 工具栏按钮 | 透明，hover 显示背景 |
| `outline` | 边框按钮 | 透明 + border |
| `danger` | 危险操作 | danger 颜色 |

### Motion Presets（来自 design-tokens.ts）

```typescript
import { motion as motionPresets } from '@/styles/design-tokens'

// 使用方式
<motion.div {...motionPresets.fadeIn}>   // 淡入
<motion.div {...motionPresets.slideUp}>  // 上滑淡入
<motion.div {...motionPresets.listItem}> // 列表项动画
```

### CSS Utility Classes

- `.surface-elevated`: 抬升表面（bg + shadow + border）
- `.glow-accent`: 径向光晕
- `.ring-accent-focus`: 焦点环

## 10. 接下来做什么（Phase 4）

详细任务描述见 `openclaw-desktop-design.md` Phase 4 部分。

### T4-1 主题切换

CSS Variables 已定义完整的 dark/light 值。需要：
- Settings 页面加 toggle 开关
- 读写 `data-theme` attribute
- 持久化到 config.json

### T4-2 全局搜索

用 SQLite FTS5 实现全文检索：
- Task 标题 + 消息内容 + 文件名
- 搜索结果可跳转到对应 Task 或文件

### T4-3 Settings 页面完善

- OpenClaw Server 地址配置（目前硬编码）
- Workspace 路径修改
- 主题切换 UI

### T4-4 错误处理 + 重连 UX

- WebSocket 断线提示 UI
- 重连动画
- 离线状态展示

### T4-5 ~ T4-7 打包分发

- electron-builder 配置 (macOS Universal Binary)
- 应用图标 + 启动画面
- Channel Plugin 打包为 npm 包

## 11. 参考文档

| 文档 | 位置 | 内容 |
|------|------|------|
| CLAUDE.md | 仓库根目录 | 项目指南 + 完整进度追踪 + 技术踩坑 |
| openclaw-desktop-design.md | 仓库根目录 | 完整设计文档（数据模型、UI 原型、ADR、所有任务） |
| design-system.md | 仓库根目录 | 设计系统规范（色彩、字体、间距、动效、组件状态、Premium tokens） |
| eui.md | 仓库根目录 | UI/UX 升级指令（只读参考） |
| gateway-ws-protocol.md | `~/.agents/memories/` | 完整 Gateway WS 协议参考（逆向工程获得） |

## 12. Git 历史

```
bc220ad feat: implement Phase 2 core UI interaction (T2-0 ~ T2-9)
c882b4e feat: implement Gateway WS communication link (Phase 1.3: T1-7/T1-8/T1-9)
e87448e update CLAUDE.md and package lock
375154c feat: initialize ClawWork monorepo with project skeleton (Phase 1.1 + 1.2)
```

Phase 3 + Phase 3.5 的全部改动尚未提交。

## 13. 已知问题

| 问题 | 影响 | 规避方式 |
|------|------|----------|
| Gateway 广播所有 session 事件 | 客户端收到无关 session 的消息 | 客户端按 sessionKey 过滤（已实现） |
| `mediaLocalRoots` 安全校验 | 文件发送可能被拒 | Plugin 需正确传播 `mediaLocalRoots` |
| Session 4AM 自动重置 | 长期 Task 上下文清空 | Plugin 需配置禁用自动重置 |
| Channel ID 校验 bug | 自定义 channel 启动报错 | 当前通过 Gateway 直连绕过 |
| Gateway 协议文档不完整 | 需要读源码反推 | 已逆向完整协议存入 memory |
