# Architecture Refactor Plan — 桌面专属能力与通用能力分离

> Status: Draft
> Created: 2026-03-14

## 1. 目标

将 ClawWork 的代码按职责拆为两层：

- **通用层 (`@clawwork/core`)** — 零平台依赖，可在 Electron/Tauri/浏览器中复用
- **桌面专属层 (`@clawwork/desktop`)** — 仅含 Electron 胶水代码

最终使 renderer 侧代码可脱离 Electron 独立测试和运行。

## 2. 能力分类

| 通用能力 | 桌面专属能力 |
|---------|------------|
| 会话管理 (session CRUD) | 本地文件系统 (fs, path) |
| 消息收发 / 流式处理 | Electron IPC (contextBridge) |
| 搜索 (接口层面) | Git 本地仓库 (simple-git) |
| 任务进度追踪 | 原生窗口能力 (dialog, BrowserWindow) |
| Gateway 通信协议 (解析/帧格式/消息模型) | SQLite (better-sqlite3, Node 原生模块) |
| | Gateway 传输层 (ws 库 + IPC 事件转发) |

## 3. 现状分析

### 3.1 耦合数据

```
Renderer 侧:
  13 个文件 × 34 次 window.clawwork.xxx() 直接调用
  使用 20/31 个 preload API 方法
  6 个 preload 方法从未被调用 (死代码)

Store 耦合率:
  taskStore      5/6 方法调用 IPC  (83%)
  messageStore   2/8              (25%)
  uiStore        1/11              (9%)

God Hook:
  useGatewayDispatcher  ~279 行, 7 个职责, 4 个 IPC 调用
```

### 3.2 依赖关系图

```
┌─ Renderer ──────────────────────────────────────────────────┐
│                                                              │
│  stores (taskStore, messageStore, uiStore)                    │
│    └──► window.clawwork.persistXxx / loadXxx                 │
│                                                              │
│  useGatewayDispatcher (God Hook, 7 职责)                     │
│    ├──► window.clawwork.onGatewayEvent / onGatewayStatus     │
│    ├──► window.clawwork.gatewayStatus / listGateways         │
│    ├──► session-sync.ts                                      │
│    │     └──► window.clawwork.loadMessages / syncSessions    │
│    └──► stores                                               │
│                                                              │
│  Setup/Settings (11 个 IPC 调用)                              │
│    └──► window.clawwork.addGateway / testGateway / ...       │
│                                                              │
│  ChatInput → window.clawwork.sendMessage                     │
│  FileBrowser → window.clawwork.listArtifacts                 │
│  FilePreview → window.clawwork.readArtifactFile              │
│  LeftNav → window.clawwork.globalSearch                      │
│                                                              │
└───────────────────────┬──────────────────────────────────────┘
                        │ contextBridge (preload, 31 方法)
                        ▼
┌─ Main Process ──────────────────────────────────────────────┐
│  ws-handlers (7 ch)  → GatewayClient[]                      │
│  data-handlers (5 ch) → Drizzle/SQLite                      │
│  artifact-handlers (5 ch) → fs + git + SQLite               │
│  settings-handlers (7 ch) → config JSON + GatewayClient     │
│  workspace-handlers (5 ch) → fs + git init + dialog         │
│  search-handlers (1 ch) → SQLite FTS                        │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 已知问题清单

| # | 问题 | 位置 |
|---|------|------|
| 1 | Store 直接调用 `window.clawwork` — 无抽象层 | taskStore, messageStore, uiStore |
| 2 | `useGatewayDispatcher` 是 God Hook (7 职责 ~279 行) | hooks/useGatewayDispatcher.ts |
| 3 | Preload 类型独立声明，未从 `@clawwork/shared` 派生 | preload/clawwork.d.ts |
| 4 | 协议解析逻辑在 `ws-handlers.ts` 和 `useGatewayDispatcher.ts` 中重复 | 两个文件 |
| 5 | `protocol.ts` 旧 Plugin WS 协议类型疑似死代码 | shared/src/protocol.ts |
| 6 | 6 个 preload 方法未被调用 | preload/index.ts |

## 4. 目标架构

### 4.1 包结构

```
packages/
  shared/          # 不变 — 类型 + 协议 + 常量
  core/            # 新增 — 通用业务逻辑层 (零平台依赖)
  desktop/         # 瘦身 — 只剩 Electron 胶水代码
```

### 4.2 `@clawwork/core` 内部结构

```
packages/core/
  src/
    ports/                       # 接口定义 (依赖反转边界)
      persistence.ts             #   loadTasks, persistTask, loadMessages, persistMessage
      gateway-transport.ts       #   connect, sendReq, onEvent, onStatus
      artifacts.ts               #   saveArtifact, listArtifacts, readFile
      search.ts                  #   globalSearch
      settings.ts                #   getSettings, updateSettings
      platform.ts                #   聚合接口, re-export 上面所有 port

    stores/                      # Zustand stores (通过 port 调用副作用)
      task-store.ts
      message-store.ts
      ui-store.ts

    services/                    # 业务编排 (纯逻辑)
      gateway-dispatcher.ts      #   事件路由主函数
      session-sync.ts            #   hydrateFromLocal, syncFromGateway
      auto-title.ts              #   自动标题逻辑

    protocol/                    # Gateway 协议解析 (纯函数)
      parse-chat-event.ts        #   extractText, parseDelta/Final
      parse-tool-event.ts        #   mapPhaseToStatus
      merge-stream.ts            #   mergeGatewayStreamText
```

**硬性约束：`core/` 的任何文件禁止 import `electron`、`fs`、`path`、`better-sqlite3`、`simple-git`、`window.clawwork`。**

### 4.3 `@clawwork/desktop` 变化

```
packages/desktop/
  src/
    main/
      adapters/                  # 新增 — Port 接口的 Electron 实现
        electron-persistence.ts  #   SQLite CRUD via Drizzle
        electron-gateway.ts      #   GatewayClient 封装
        electron-artifacts.ts    #   fs + git
        electron-settings.ts     #   config JSON + dialog
        electron-search.ts       #   SQLite FTS
      ws/                        # 不变 — GatewayClient, device-identity
      ipc/                       # 瘦身 — 只做 IPC 注册, 逻辑委托给 adapters
      db/                        # 不变 — schema, migrations

    preload/                     # 精简 — 删除死代码方法, API 可能缩减

    renderer/
      platform/                  # 新增
        electron-adapter.ts      #   IPlatformAdapter 的 renderer 侧实现
                                 #   内部调用 window.clawwork, 对外暴露 port 接口
      hooks/                     # 瘦身
        useGatewayDispatcher.ts  #   → 只做 React 生命周期绑定, 委托 core
      stores/ → 删除             # stores 移到 core
      lib/session-sync.ts → 删除 # 移到 core
```

### 4.4 依赖注入方式

不引入 DI 框架。利用 Zustand 的工厂函数 + React Context：

```typescript
// core/stores/task-store.ts
import type { PersistencePort } from '../ports/persistence'

export function createTaskStore(persistence: PersistencePort) {
  return create<TaskState>()((set, get) => ({
    tasks: [],
    createTask(gatewayId?: string) {
      const task = { /* ... */ }
      set(s => ({ tasks: [...s.tasks, task] }))
      persistence.persistTask(task)
    },
    // ...
  }))
}

// desktop/renderer/main.tsx
import { createTaskStore } from '@clawwork/core'
import { electronPersistence } from './platform/electron-adapter'

const useTaskStore = createTaskStore(electronPersistence)
```

### 4.5 `useGatewayDispatcher` 拆分方案

当前 7 个职责拆成独立 hook/函数：

| 新 hook/函数 | 原职责 | 类型 |
|-------------|--------|------|
| `useChatEventRouter` | Chat 事件路由 + 流式文本分发 | core (纯逻辑) + 薄 hook 壳 |
| `useToolCallRouter` | Agent tool-call 事件处理 | core (纯逻辑) + 薄 hook 壳 |
| `useUnreadTracker` | 非活跃任务未读标记 | core (纯逻辑) |
| `useAutoTitle` | 首条消息自动标题 | core (纯逻辑) |
| `useSessionHydration` | 挂载时从 SQLite 加载数据 | core service |
| `useGatewayStatusTracker` | 连接状态监听 + 初始化 | core + platform adapter |
| `useGatewayBootstrap` | 组合以上，挂载到 React 生命周期 | desktop renderer |

## 5. 实施步骤

按风险从低到高，增量推进，每步可独立验证：

| 步骤 | 内容 | 改动量 | 风险 | 前置 |
|------|------|--------|------|------|
| **S0** | 清理死代码: 6 个未调用 preload 方法, `protocol.ts` 旧类型 | 删除 | 无 | 无 |
| **S1** | 创建 `packages/core/` 包, 定义 `ports/` 接口 | 新增 ~5 文件 | 无 | 无 |
| **S2** | 提取 `protocol/` 纯函数到 core (extractText, mergeStream 等) | 移动 + 新增 | 低 | S1 |
| **S3** | 移动 3 个 store 到 core, 改为工厂函数 + port 注入 | 改 3 文件 + 调整 import | 低 | S1 |
| **S4** | 在 renderer 写 `ElectronPlatformAdapter`, App 根注入 | 新增 1 文件, 改 2 文件 | 低 | S3 |
| **S5** | 移动 `session-sync.ts` 到 core, 接受 adapter 参数 | 改 1 文件 | 低 | S3, S4 |
| **S6** | 拆 `useGatewayDispatcher` 为 5-6 个独立 hook/函数 | 1 → 5-6 文件 | **中** | S2-S5 |
| **S7** | 提取 `ws-handlers.ts` 中的协议解析到 `core/protocol/` | 改 2-3 文件 | 低 | S2 |
| **S8** | Preload 类型改为从 `@clawwork/shared` / `core` 派生 | 改 1 文件 | 低 | S1 |

### 依赖关系

```
S0 (独立)
S1 ──► S2 (并行)
  ├──► S3 ──► S4 ──► S5
  │                    └──► S6
  └──► S7 (可与 S3-S5 并行)
S8 (可在任意时刻做)
```

### 每步验证标准

每一步完成后必须通过：
1. `tsc -b packages/shared/tsconfig.json` — shared 编译通过
2. `tsc -b packages/core/tsconfig.json` — core 编译通过 (S1 起)
3. `tsc --noEmit -p packages/desktop/tsconfig.json` — desktop 类型检查通过
4. `pnpm --filter @clawwork/desktop dev` — 应用正常启动
5. 手动验证：能创建任务、发消息、收到 Agent 回复

## 6. 包依赖关系

### 当前

```
@clawwork/shared  ←──  @clawwork/desktop
```

### 目标

```
@clawwork/shared  ←──  @clawwork/core  ←──  @clawwork/desktop
```

`core` 依赖 `shared` 的类型定义，`desktop` 依赖 `core` 的 stores/services 和 `shared` 的类型。

## 7. 风险与注意事项

1. **Gateway 传输 vs 协议的边界** — 协议解析 (帧格式、content 提取) 是通用的，但 WebSocket 连接管理 (`ws` 库、reconnect、heartbeat) 和 IPC 事件转发是桌面专属的。拆分时注意不要把传输层拉进 core。

2. **Zustand store 工厂化的 HMR 影响** — `create()` 从模块顶层调用改为工厂函数调用，需确认 electron-vite HMR 仍能正确保持 store 状态。可能需要在 dev 模式下做 store 实例缓存。

3. **Store 间跨引用** — `taskStore.createTask` 读 `useUiStore.getState().defaultGatewayId`。移到 core 后这种 cross-store 依赖需要显式传参或通过统一的 store 容器解决。

4. **preload API 精简的时机** — 先完成 renderer 侧的 adapter 封装，确认哪些 IPC channel 确实不需要了，再精简 preload。不要提前删。

5. **不要在 S6 之前重构 Settings/Setup** — 这两个页面有 11 个 IPC 调用但都是直接的 UI→平台操作，不涉及 store 或业务逻辑。优先级低，留到最后或单独处理。
