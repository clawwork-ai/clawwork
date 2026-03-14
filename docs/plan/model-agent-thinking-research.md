# 调研：消息/会话元数据 & 模型/Agent/思考深度切换

> Status: Completed
> Created: 2026-03-14
> Source: OpenClaw Gateway v2026.3.12 逆向分析

## 1. 结论摘要

| 能力 | Gateway 是否支持 | ClawWork 当前状态 |
|------|----------------|-----------------|
| 每条消息显示模型名 | **支持** — session 级别记录 `model`、`modelProvider` | **未实现** — 完全忽略 |
| Token 用量 (↑input ↓output) | **支持** — session 级别 `inputTokens`/`outputTokens`/`totalTokens` | **未实现** — 完全忽略 |
| 上下文窗口百分比 (7% ctx) | **支持** — `contextTokens` + `totalTokens` 可算 | **未实现** |
| 思考深度 (thinking level) | **支持** — `thinkingLevel` 字段, `sessions.patch` 可修改 | **未实现** — 字段声明了但没读 |
| Reasoning tokens (R3.6k) | **支持** — `reasoningLevel` 字段控制推理输出 | **未实现** |
| Agent 身份 | **支持** — `agents.list` RPC, session key 中的 agentId | **硬编码 `main`** |
| 切换模型 | **支持** — `sessions.patch` 的 `model` 字段 | **未实现** |
| 切换 Agent | **支持** — 修改 session key 的 agent 前缀 | **未实现** — session key 硬编码 |
| 切换思考深度 | **支持** — `sessions.patch` 的 `thinkingLevel` 字段 | **未实现** |
| 列出可用模型 | **支持** — `models.list` RPC | **未实现** |
| 列出可用 Agent | **支持** — `agents.list` RPC | **未实现** |

## 2. Gateway 协议详解

### 2.1 `sessions.list` 返回的 Session 元数据

Gateway 的 `sessions.list` RPC 返回每个 session 的完整元数据（`reply-BEN3KNDZ.js:85093` `listSessionsFromStore()`）：

```typescript
// 每个 session 条目包含以下字段：
{
  key: string,                    // session key, e.g. "agent:main:clawwork:task:xxx"
  displayName?: string,           // 显示名称
  label?: string,                 // 用户自定义标签
  updatedAt: number,              // 最后更新时间戳

  // === 模型信息 ===
  modelProvider: string,          // 模型提供商, e.g. "anthropic", "openai"
  model: string,                  // 模型 ID, e.g. "claude-opus-4-6", "gpt-5.4"
  contextTokens?: number,         // 上下文窗口大小, e.g. 200000

  // === Token 用量 ===
  inputTokens?: number,           // 累计输入 token 数
  outputTokens?: number,          // 累计输出 token 数
  totalTokens?: number,           // 衍生的总 token 数
  totalTokensFresh: boolean,      // totalTokens 是否为最新计算
  responseUsage?: string,         // 用量显示模式: "off" | "tokens" | "full"

  // === 思考 / 推理 ===
  thinkingLevel?: string,         // 思考深度: 模型相关的级别值
  reasoningLevel?: string,        // 推理输出: "on" | "off" | "stream"
  elevatedLevel?: string,         // 提升级别: "on" | "off" | "ask" | "full"
  fastMode?: boolean,             // 快速模式

  // === Agent 信息 ===
  // agentId 嵌入在 session key 中: "agent:<agentId>:..."
  // 可通过 parseAgentSessionKey(key) 提取

  // === 其他 ===
  sessionId?: string,
  verboseLevel?: string,
  sendPolicy?: string,
  chatType?: string,
  channel?: string,
  spawnedBy?: string,
}
```

### 2.2 `chat.history` 返回的元数据

`chat.history` 的 response payload（`gateway-cli-Bmg642Lj.js:10878-10887`）包含：

```typescript
{
  sessionKey: string,
  sessionId: string,
  messages: ChatMessage[],        // 历史消息数组
  thinkingLevel?: string,         // 当前会话的思考深度
  fastMode?: boolean,             // 快速模式状态
  verboseLevel?: string,          // 详细级别
}
```

**ClawWork 当前只提取了 `messages`，完全忽略了 `thinkingLevel`、`fastMode`、`verboseLevel`。**

### 2.3 实时 Chat 事件的 Payload 结构

`chat` 事件（`gateway-cli-Bmg642Lj.js:2849-2960`）的 payload：

```typescript
// delta 事件
{
  runId: string,                  // 运行 ID (可用于关联)
  sessionKey: string,
  seq: number,
  state: "delta",
  message: {
    role: "assistant",
    content: [{ type: "text", text: string }],
    timestamp: number,
  }
}

// final 事件
{
  runId: string,
  sessionKey: string,
  seq: number,
  state: "final",
  stopReason?: string,            // 停止原因
  message?: {                     // 有时为空 (silent reply)
    role: "assistant",
    content: [{ type: "text", text: string }],
    timestamp: number,
  }
}
```

**注意：实时 chat 事件中不直接包含 model/usage 信息。** 这些信息是在 run 完成后写入 session store 的（`gateway-cli-Bmg642Lj.js:4494-4530`）。想要获取 per-message 的 model/usage，需要在 `final` 事件后调用 `sessions.list` 或 `sessions.preview` 来刷新 session 元数据。

### 2.4 Run 完成后的 Usage 写入

在 Agent run 完成后（`gateway-cli-Bmg642Lj.js:4494-4540`），Gateway 会把以下信息写入 session entry：

```typescript
// 从 finalRunResult.meta.agentMeta 提取
const usage = finalRunResult.meta?.agentMeta?.usage;
// usage 结构:
{
  input?: number,       // 输入 token
  output?: number,      // 输出 token
  cacheRead?: number,   // 缓存读取
  cacheWrite?: number,  // 缓存写入
}

const modelUsed = finalRunResult.meta?.agentMeta?.model;      // 实际使用的模型
const providerUsed = finalRunResult.meta?.agentMeta?.provider; // 实际使用的提供商

// 写入 session entry
sessionEntry.inputTokens = input;
sessionEntry.outputTokens = output;
sessionEntry.contextTokens = contextTokens;   // 上下文窗口大小
sessionEntry.cacheRead = usage.cacheRead;
sessionEntry.cacheWrite = usage.cacheWrite;
setSessionRuntimeModel(sessionEntry, { provider, model });
```

## 3. 可用的 Gateway RPC 方法

### 3.1 `agents.list` — 列出可用 Agent

**Request:** `{ }` (无必需参数)

**Response:** (`reply-BEN3KNDZ.js:84768`)
```typescript
{
  defaultId: string,            // 默认 agent ID, 通常 "main"
  mainKey: string,              // 主 key
  scope: string,                // "per-sender" 等
  agents: [
    {
      id: string,               // e.g. "main", "research", "code-review"
      name?: string,            // 显示名称
      identity?: {
        name?: string,
        theme?: string,
        emoji?: string,
        avatar?: string,
        avatarUrl?: string,     // 头像 URL
      }
    }
  ]
}
```

### 3.2 `models.list` — 列出可用模型

**Request:** `{ }` (无必需参数)

**Response:** (`gateway-cli-Bmg642Lj.js:12669`)
```typescript
{
  models: ModelCatalogEntry[]   // 完整的模型目录
}
```

### 3.3 `sessions.patch` — 修改会话配置

**Request:**
```typescript
{
  sessionKey: string,           // 目标 session
  // 以下均为可选, 传 null 表示清除/重置
  thinkingLevel?: string | null,   // 修改思考深度
  fastMode?: boolean | null,       // 切换快速模式
  model?: string | null,           // 切换模型 (e.g. "gpt-5.4", "claude-opus-4-6")
  reasoningLevel?: string | null,  // "on" | "off" | "stream"
  elevatedLevel?: string | null,   // "on" | "off" | "ask" | "full"
  verboseLevel?: string | null,    // 详细级别
  responseUsage?: string | null,   // "off" | "tokens" | "full"
  label?: string | null,           // 自定义标签
  execHost?: string | null,        // "sandbox" | "gateway" | "node"
  execSecurity?: string | null,    // "deny" | "allowlist" | "full"
}
```

### 3.4 `agents.create` / `agents.update` / `agents.delete` — Agent CRUD

完整 CRUD 支持。`agents.create` 接受 `name`、`workspace`、`emoji`、`avatar` 等参数。

## 4. Session Key 与 Agent 的关系

当前 ClawWork 硬编码 session key 为：
```
agent:main:clawwork:task:<taskId>
```

其中 `main` 是 agent ID。要支持多 Agent，需要：
```
agent:<agentId>:clawwork:task:<taskId>
```

Server 端通过 `resolveSessionAgentId()` 从 session key 中提取 agentId，据此加载对应 agent 的配置、system prompt、workspace 等。

## 5. 当前 ClawWork 丢失的数据

### 5.1 `sessions.list` 响应中被忽略的字段

ClawWork 的 `ws:sync-sessions` handler (`ws-handlers.ts`) 只提取了：
- `s.key` — session key
- `s.updatedAt` — 时间戳
- `s.derivedTitle` / `s.label` / `s.displayName` — 标题

**以下字段全部被丢弃：**
- `modelProvider`, `model` — 模型信息
- `inputTokens`, `outputTokens`, `totalTokens`, `contextTokens` — token 用量
- `thinkingLevel`, `reasoningLevel`, `fastMode` — 思考配置
- `responseUsage` — 用量显示配置
- `elevatedLevel`, `verboseLevel` — 运行配置

### 5.2 `chat.history` 响应中被忽略的字段

- `thinkingLevel` — 会话思考深度
- `fastMode` — 快速模式
- `verboseLevel` — 详细级别

### 5.3 实时 Chat 事件中被忽略的字段

- `runId` — 声明了但从未使用
- `thinking` content blocks (`type: 'thinking'`) — 声明了但被 `extractText()` 过滤掉

### 5.4 Preload API 中未实现的方法

6 个声明但从未调用的 preload 方法：`chatHistory`, `listSessions`, `saveArtifact`, `getArtifact`, `getWorkspacePath`, `onArtifactSaved`

## 6. 实现方案建议

### 6.1 展示层 — 消息/会话元数据显示

**Task/Session 级别展示（优先级高）：**

| 显示项 | 数据源 | 实现路径 |
|-------|--------|---------|
| 模型名 badge | `sessions.list` → `model` | session 列表同步时提取, 存入 taskStore |
| 当前 Agent 名 | `agents.list` → `agents[].name` + session key 中的 agentId | 新增 agentStore |
| 思考深度指示 | `sessions.list` → `thinkingLevel` | 存入 taskStore |

**Message 级别展示（优先级中）：**

| 显示项 | 数据源 | 实现路径 |
|-------|--------|---------|
| ↑input / ↓output tokens | `sessions.list` → `inputTokens`/`outputTokens` (session 累计) | final 事件后刷新 session 数据 |
| R (reasoning tokens) | 需要扩展 — 当前 gateway 不在 chat 事件中直接传 | 从 session-level 数据推算或等 gateway 扩展 |
| ctx% | `totalTokens / contextTokens * 100` | 同上 |

**注意：OpenClaw Web UI 的 per-message token 显示很可能来自 control-ui 内部的特殊渠道（control socket 有更多权限），而非标准 gateway 事件。标准 chat 事件中不包含 per-message usage。** 可行方案：
1. 在 `final` 事件后立即调用 `sessions.list` 刷新 session 级 token 数据，显示为 session 总量
2. 或者使用 `sessions.preview` 获取更细粒度的数据

### 6.2 控制层 — 切换 Agent / 模型 / 思考深度

**切换模型（优先级高）：**
1. 新增 IPC: `ws:models-list` → 调用 `GatewayClient.sendReq('models.list', {})`
2. 新增 IPC: `ws:session-patch` → 调用 `GatewayClient.sendReq('sessions.patch', { sessionKey, model })`
3. Preload 新增: `listModels(gatewayId)`, `patchSession(gatewayId, sessionKey, patch)`
4. UI: 在 ChatInput 区域或 RightPanel 添加模型选择器

**切换 Agent（优先级中）：**
1. 新增 IPC: `ws:agents-list` → 调用 `GatewayClient.sendReq('agents.list', {})`
2. 修改 `buildSessionKey()` — 接受 `agentId` 参数（不再硬编码 `main`）
3. Task 创建时选择 Agent
4. UI: 新建任务 dialog 中添加 Agent 选择器

**切换思考深度（优先级中）：**
1. 复用 `ws:session-patch` IPC
2. UI: 在 ChatInput 区域添加 thinking level 选择器
3. 可选值取决于当前模型（不同模型支持不同的 thinking levels）

### 6.3 数据模型变更

```typescript
// @clawwork/shared/types.ts — Task 扩展
export interface Task {
  // ... existing fields ...
  agentId?: string;           // 新增: 关联的 agent ID
  model?: string;             // 新增: 当前使用的模型
  modelProvider?: string;     // 新增: 模型提供商
  thinkingLevel?: string;     // 新增: 思考深度
  inputTokens?: number;       // 新增: 累计输入 tokens
  outputTokens?: number;      // 新增: 累计输出 tokens
  contextTokens?: number;     // 新增: 上下文窗口大小
}

// @clawwork/shared/types.ts — Message 扩展
export interface Message {
  // ... existing fields ...
  runId?: string;              // 新增: 关联的 run ID
  thinkingContent?: string;   // 新增: thinking blocks 内容
}

// constants.ts — buildSessionKey 修改
export function buildSessionKey(taskId: string, agentId: string = 'main'): string {
  return `agent:${agentId}:clawwork:task:${taskId}`;
}
```

### 6.4 SQLite Schema 变更

```sql
-- tasks 表新增列
ALTER TABLE tasks ADD COLUMN agent_id TEXT DEFAULT 'main';
ALTER TABLE tasks ADD COLUMN model TEXT;
ALTER TABLE tasks ADD COLUMN model_provider TEXT;
ALTER TABLE tasks ADD COLUMN thinking_level TEXT;
ALTER TABLE tasks ADD COLUMN input_tokens INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN output_tokens INTEGER DEFAULT 0;
ALTER TABLE tasks ADD COLUMN context_tokens INTEGER;

-- messages 表新增列
ALTER TABLE messages ADD COLUMN run_id TEXT;
ALTER TABLE messages ADD COLUMN thinking_content TEXT;
```

## 7. 实施优先级

| P | 任务 | 依赖 |
|---|------|------|
| P0 | 新增 `models.list`、`agents.list`、`sessions.patch` 的 IPC 通道 | 无 |
| P0 | 从 `sessions.list` 提取 model/token/thinking 元数据，存入 taskStore | P0 IPC |
| P1 | Task 卡片上显示模型 badge + token 概要 | P0 数据 |
| P1 | ChatInput 区域添加模型选择器 (dropdown) | P0 IPC |
| P1 | ChatInput 区域添加 thinking level 选择器 | P0 IPC |
| P2 | 新建任务时选择 Agent | P0 IPC + session key 改造 |
| P2 | 提取并显示 thinking content blocks | Message 类型扩展 |
| P3 | SQLite schema 迁移 + 持久化元数据 | 数据模型变更 |
