# ClawWork — Application Design Document

> OpenClaw ClawWork · Version: v0.2 | Date: 2026-03-12 | Authors: samzong + Claude

---

## 1. Problem Definition

### 1.1 Core Pain Points

IM tools (Feishu/Lark, Telegram, Slack) used as OpenClaw conversation channels have structural shortcomings:

- **Linear conversation flow**: Task status is buried in the message stream — impossible to see progress at a glance
- **No context sidebar**: Lacks structured display for Progress / Context / Files
- **Multi-task chaos**: When multiple AI tasks run concurrently, messages from different tasks get mixed together
- **Scattered artifacts**: AI-generated files, code, and documents are scattered across chat history, hard to search and manage

### 1.2 Goals

**Target product experience: Claude Cowork**, with added file management capabilities; technically powered by OpenClaw.

Core value propositions:

1. **Parallel multi-task** — Like Claude Cowork, multiple Tasks can run simultaneously; switch freely via the left-side list without interference
2. **Structured context** — Three-panel layout: navigation + conversation flow + Progress/Artifacts panel
3. **Artifact file management** — A capability Claude Cowork lacks: unified storage, search, and versioning of all AI artifacts
4. **Local-first** — Artifacts stored in a local Git repo, traceable and accessible offline

### 1.3 Feature Comparison with Claude Cowork

| Capability | Claude Cowork | This Project | Difference |
|------|--------------|--------|----------|
| Parallel Tasks | ✅ Left-side list switching | ✅ Same interaction model | Fully aligned |
| Three-panel layout | ✅ Nav + Chat + Context | ✅ Same | Fully aligned |
| Progress panel | ✅ Task step tracking | ✅ Same | Fully aligned |
| Artifacts panel | ✅ Current conversation artifacts | ✅ Same + global file manager | Enhanced |
| File manager | ❌ None | ✅ Global artifact browse/search/filter | New |
| Backend | Claude API | OpenClaw Gateway | Replaced |
| Storage | Ephemeral sessions | Local Git Repo persistence | Enhanced |

### 1.4 Non-Goals

- Not an OpenClaw admin console (Agent config, model management, etc. stay in OpenClaw Server)
- Not a general-purpose IM client (no group chats, channels, @mentions, or IM semantics)
- Not a collaboration tool (single-user desktop app)

---

## 2. Core Concepts & Data Model

### 2.1 Task (Core Entity)

Task is the first-class citizen in this app, mapping 1:1 to an OpenClaw conversation session. **Multiple Tasks can be active and executing in parallel simultaneously**, just like the Claude Cowork multi-task experience.

```
Task {
  id: string              // local UUID
  sessionKey: string      // OpenClaw session key (format: agent:<agentId>:<taskId>)
  sessionId: string       // OpenClaw session ID (assigned by Gateway)
  title: string           // user-named or AI auto-summary
  status: enum            // active | completed | archived
  createdAt: timestamp
  updatedAt: timestamp
  tags: string[]          // user-defined tags
  artifactDir: string     // artifact directory path (relative to repo root)
}
```

**Mapping to OpenClaw Sessions:**

- When a Task is created, an independent session is created on the OpenClaw Gateway (via a unique sessionKey)
- OpenClaw session key format is `agent:<agentId>:<mainKey>`; we use the Task's local UUID as mainKey, ensuring each Task has an independent conversation context
- OpenClaw Gateway natively supports cross-session parallel execution: messages within a session are processed serially, while sessions run concurrently without interference
- Gateway broadcasts events from all sessions via WebSocket; the client filters and dispatches by sessionKey to the corresponding Task

**Lifecycle (simplified):**

```
[User clicks New Task] → active (multiple active Tasks can coexist)
                             ↓
                        completed (user marks done; conversation history retained for viewing)
                             ↓
                        archived (archived; not shown in default list)
```

Note: There is no paused state. OpenClaw sessions are naturally "dormant" between messages — no explicit pause needed. Users can switch back to any active Task and continue the conversation at any time, consistent with Claude Cowork behavior.

### 2.2 Message

```
Message {
  id: string
  taskId: string           // parent Task
  role: enum               // user | assistant | system
  content: string          // message text (supports Markdown)
  artifacts: Artifact[]    // artifacts produced by this message
  toolCalls: ToolCall[]    // AI tool-call records
  timestamp: timestamp
}
```

### 2.3 Artifact (Task Artifact)

```
Artifact {
  id: string
  taskId: string
  messageId: string        // message that produced this artifact
  type: enum               // file | code | image | link | structured_data
  name: string             // display name
  filePath: string         // local storage path (relative to Task artifact directory)
  mimeType: string
  size: number
  createdAt: timestamp
}
```

### 2.4 Storage Structure (Git Repo)

On first launch, the user selects a directory which is initialized as a Git repo:

```
<user-workspace>/
├── .openclaw/
│   ├── config.yaml        # app config (OpenClaw server address, channel info, etc.)
│   └── db.sqlite           # local metadata database (Task/Message index)
├── tasks/
│   ├── 2026-03-12-refactor-user-module/
│   │   ├── artifacts/      # artifacts for this Task
│   │   │   ├── schema.sql
│   │   │   ├── design.md
│   │   │   └── screenshot.png
│   │   └── .task.json      # Task metadata
│   └── 2026-03-11-api-doc-generation/
│       ├── artifacts/
│       └── .task.json
└── .gitignore              # ignores db.sqlite, temp files, etc.
```

**Design Decision Notes:**

- **SQLite for indexing, filesystem for storage**: SQLite enables fast queries and search; actual artifact files live directly on the filesystem. They're linked via filePath.
- **Git for versioning, not syncing**: The Git repo provides local version traceability. If multi-device sync is needed later, users can configure a remote (GitHub, Gitea, etc.) themselves.
- **Auto-commit strategy**: Automatically commits on every Task state change or new artifact generation; commit messages include the Task title and a change summary. No manual git operations required.

---

## 3. OpenClaw Gateway Integration

### 3.1 Gateway-Only Architecture

ClawWork communicates with the OpenClaw Gateway (:18789) via a single WebSocket connection:

```
┌─────────────────────────────────────────────────────────────┐
│ User's machine                                              │
│                                                             │
│  ┌─────────────────────┐      ┌──────────────────────────┐  │
│  │ OpenClaw Server      │      │ ClawWork Desktop App     │  │
│  │ (Node.js process)    │  WS  │ (Electron process)       │  │
│  │                     │◄────►│                          │  │
│  │ ┌─────────────────┐ │      │  React UI + SQLite       │  │
│  │ │ Gateway :18789  │ │      │  Git Repo (artifact VCS)  │  │
│  │ │ Agent Engine    │ │      │                          │  │
│  │ └─────────────────┘ │      └──────────────────────────┘  │
│  └─────────────────────┘                                    │
└─────────────────────────────────────────────────────────────┘
```

Desktop acts as a Gateway WebSocket client, communicating via JSON-RPC style frames:

**Outbound (Desktop → Gateway):**

| RPC Method | Purpose |
|---|---|
| `chat.send` | Send user message (`sessionKey` + `message` + `idempotencyKey`, `deliver: false`) |
| `chat.history` | Fetch session message history |
| `sessions.list` | List all sessions |

**Inbound (Gateway → Desktop events):**

| Event | Purpose |
|---|---|
| `chat` | Agent text reply (`payload.message.content[]`) |
| `agent` | Tool-call events (requires `caps:["tool-events"]`) |

**Connection Handshake**: Gateway sends `connect.challenge` (containing nonce) first; client replies with a `connect` request (protocol=3, client.id=`gateway-client`, mode=`backend`).

> Historical note: An earlier design featured a Desktop↔Channel Plugin dual-channel architecture (Plugin ran inside OpenClaw, communicating with Desktop via :13579 WS). Testing confirmed that a single Gateway channel handles the complete conversation flow + tool-call events. The dual-channel architecture was fully removed during the Gateway-Only refactor (G1-G9). `packages/channel-plugin` code remains in the repo but is excluded from the workspace.

### 3.2 Session Mechanism & Multi-Task Parallelism

**Confirmed: OpenClaw natively supports multi-session parallelism — this is the foundation for the Cowork-style multi-task experience.**

**Session Key Structure:**

```
agent:<agentId>:<mainKey>
```

ClawWork generates a unique mainKey for each Task (using the Task's local UUID), ensuring each Task maps to an independent OpenClaw session. For example:

```
agent:my-agent:task-a1b2c3d4    ← Task "Refactor user module"
agent:my-agent:task-e5f6g7h8    ← Task "API doc generation"
agent:my-agent:task-i9j0k1l2    ← Task "Data migration" (three Tasks can be active simultaneously)
```

**Parallel Execution Model:**

- OpenClaw Gateway uses a "Default Serial, Explicit Parallel" architecture
- **Within a session**: Messages are processed serially (via lane queue), preventing race conditions
- **Across sessions**: Fully parallel execution, no blocking between sessions
- This means users can switch to Task B and send a new message while Task A is waiting for an Agent response

**WebSocket Event Dispatch:**

Gateway broadcasts events from all sessions via WebSocket (known design: no session-level filtering). The client needs to:

1. Receive all events
2. Extract `sessionKey` from the event payload
3. Dispatch by sessionKey to the corresponding Task's message queue
4. Only render messages for the currently active Task; background Tasks update the unread count in the left-side list

**Session Lifecycle:**

- Create: Automatically created when the user creates a new Task
- Maintain: Sessions are naturally dormant between messages, consuming no Gateway resources
- Reset: OpenClaw resets sessions daily at 4:00 AM by default. ClawWork should disable auto-reset via server config to maintain long-term Task conversation context
- Persist: Gateway stores conversation records as `.jsonl` transcript files (`~/.openclaw/agents/<agentId>/sessions/<sessionId>.jsonl`); the client also keeps a local SQLite copy for offline viewing and search

### 3.3 Communication Architecture

```
┌──────────────────┐        WebSocket         ┌──────────────────┐
│  Desktop Client  │ ◄────────────────────►   │  OpenClaw Server │
│  (Electron App)  │                          │  (Gateway:18789) │
│                  │   1. chat.send (sessionKey)│                │
│  Task A ─┐      │   2. ← chat event (reply) │                  │
│  Task B ─┤ mux  │   3. ← agent event (tool) │  - Agent Engine  │
│  Task C ─┘      │   4. ← artifact path      │  - Gateway WS    │
│  (parallel exec) │                          │                  │
│                  │   Client dispatches       │                  │
│  - Local SQLite  │   by sessionKey to Task   │  Inter-session   │
│  - Git Repo      │                          │  parallel exec   │
└──────────────────┘                          └──────────────────┘
```

**Message Flow:**

1. **User → Agent**: ClawWork sends message via `chat.send` RPC, carrying the target Task's sessionKey + idempotencyKey
2. **Agent → User**: Gateway pushes Agent reply via `chat` event; client routes to the corresponding Task by sessionKey
3. **Tool calls**: When the Agent executes tools, progress is pushed in real time via `agent` events (requires `caps:["tool-events"]`)
4. **Artifact handling**: Artifact files are copied to the workspace artifact directory via local paths (see 3.4 File Transfer Design)

### 3.4 File Transfer Design

MVP assumes co-located deployment only: artifact files are copied directly to the workspace artifact directory via local paths.

| Scenario | Approach | Notes |
|------|------|------|
| **Co-located (MVP)** | Pass path directly | Agent artifacts are passed via `mediaPath`; ClawWork reads the local file and copies to the Task artifact directory |
| **Remote (future)** | Third-party storage relay | Artifacts uploaded to third-party storage (WebDAV / S3 / MinIO); ClawWork downloads from the storage service |

```
Local path (co-located) ← MVP default
       ↓ extensible
WebDAV (self-hosted NAS / Nextcloud, etc.)
S3-compatible (AWS S3 / MinIO / Cloudflare R2)
```

> **Note**: OpenClaw recently (v2026.3.2) strengthened `mediaLocalRoots` security checks. See issue [#20258] and [#36477].

### 3.5 Confirmed Technical Details + Open Questions

**Confirmed (via reverse engineering):**

1. **Gateway protocol**: JSON-RPC style frame format (`req`/`res`/`event`), protocol version 3, challenge-response auth. Full protocol reference stored in project memory
2. **Chat event payload structure**: `payload.message.content[]` (not `payload.content[]`). Content is an array supporting `text`, `thinking`, and `toolCall` block types
3. **Valid Client ID/Mode**: Electron uses `client.id="gateway-client"` + `mode="backend"`. Avoid `openclaw-control-ui` (triggers browser origin check)
4. **Broadcast filtering**: Client-side filtering by sessionKey is the current viable approach (Gateway has no session-level filtering planned)
5. **Gateway-Only architecture is viable**: A single Gateway channel handles the complete conversation flow + tool-call events; no need for the Channel Plugin dual-channel setup

**Open Questions:**

1. ~~Gateway protocol details~~ → Full protocol reverse-engineered
2. **Disabling session auto-reset**: How to configure the server to disable 4:00 AM auto-reset
3. **Session recovery after WS reconnect**: Historical messages can be backfilled via `chat.history` RPC after reconnection
4. **`mediaLocalRoots` configuration**: How to properly configure for the ClawWork use case
5. ~~Channel Plugin verification~~ → Bypassed via Gateway-Only architecture
6. ~~Broadcast filtering~~ → Client-side filtering implemented

---

## 4. UI Design

### 4.1 Overall Layout: Three-Panel Structure

```
┌─────────┬──────────────────────────┬──────────────────┐
│         │                          │                  │
│  Left   │      Main Area           │   Right Panel    │
│  Nav    │      (conversation flow) │   (context)      │
│  (240px)│                          │   (320px)        │
│         │                          │                  │
│         │                          │                  │
│         │                          │                  │
│         │                          │                  │
│         │                          │                  │
│         │                          │                  │
│         │  ┌──────────────────┐    │                  │
│         │  │   Input box       │    │                  │
│         │  └──────────────────┘    │                  │
└─────────┴──────────────────────────┴──────────────────┘
```

### 4.2 Left Navigation Bar (Left Nav)

The left nav has a fixed structure and does not switch modes. File browsing is accessed via an entry point that opens in the Main Area.

```
┌─────────────┐
│ [+ New Task] │   ← New Task button
│ [🔍 Search ] │   ← Global search entry
│ [📁 Files  ] │   ← File storage entry (click to switch Main Area to file browser)
├─────────────┤
│              │
│ Recent Tasks │   ← Reverse chronological, newest on top
│  ├ Refactor  │      Currently selected Task is highlighted
│  ├ API Docs  │      Hover shows creation time and tags
│  ├ Migration │
│  └ ...       │
│              │
├─────────────┤
│ [⚙ Settings] │   ← Pinned to bottom
└─────────────┘
```

- Top three fixed entries: New Task / Search / Files
- Below is the Task list, reverse chronological, no grouping (keep it simple)
- Currently selected Task is highlighted
- Task list items show: title + status badge (active/completed) + last updated time

### 4.3 File Browser (Displayed in Main Area)

After clicking [📁 Files] on the left, Main Area switches from conversation flow to a full-screen file browser view:

```
┌──────────────────────────────────────────────────┐
│ ← Back                     File Browser          │  ← Top nav bar, ← Back returns to previous Task conversation
├──────────────────────────────────────────────────┤
│ [🔍 Search files...                             ] │  ← Search bar
│                                                  │
│ [All] [Docs] [Code] [Images]                     │  ← File type quick-filter tabs
├──────────────────────────────────────────────────┤
│                                                  │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ 📄       │ │ 📝       │ │ 🖼       │          │
│ │schema-v2 │ │migration │ │screenshot│          │  ← Grid list
│ │.sql      │ │.sql      │ │.png      │          │     Reverse chronological
│ │ 03-12    │ │ 03-12    │ │ 03-11    │          │     Shows: icon + filename + date
│ │ Refactor │ │ Refactor │ │ API Docs │          │     Bottom shows parent Task name
│ └──────────┘ └──────────┘ └──────────┘          │
│                                                  │
│ ┌──────────┐ ┌──────────┐                        │
│ │ 📄       │ │ 📄       │                        │  Clicking a file card:
│ │design    │ │api-spec  │                        │  → Navigates to the corresponding Task conversation
│ │.md       │ │.yaml     │                        │     and highlights the message that produced the file
│ │ 03-12    │ │ 03-11    │                        │
│ │ Refactor │ │ API Docs │                        │
│ └──────────┘ └──────────┘                        │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Design note**: The file browser occupies the entire Main Area + Right Panel space (the right panel is hidden at this point), because the grid list needs enough horizontal space to display file cards. Clicking a file card navigates back to the corresponding Task conversation view.

### 4.4 Center Main Area — Conversation Flow (Default Main Area View)

After selecting a Task, the full conversation flow is displayed:

```
┌──────────────────────────────┐
│ Task: Refactor User Module [status] │  ← Task title bar
├──────────────────────────────┤
│                              │
│ 👤 Help me refactor the user │  ← User message
│    module's DB schema for    │
│    multi-tenancy             │
│                              │
│ 🤖 Sure, let me analyze the │  ← AI response
│    current schema            │     Inline collapsible tool-call block
│    ┌─ Tool Call ────────────┐│
│    │ 📂 Read schema.sql     ││
│    │ ✅ Done                 ││
│    └────────────────────────┘│
│                              │
│    Based on my analysis,     │
│    here's the proposed plan: │
│    [View schema-v2.sql →]    │  ← Inline artifact link
│                              │
│ 👤 Go with option 2, add    │
│    audit fields              │
│                              │
│ 🤖 Updated. Added audit_log │
│    table                     │
│    [View schema-v2.sql →]    │
│    [View migration.sql →]    │
│                              │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ Type a message...  [Send]│ │  ← Input box (Shift+Enter for newline)
│ │              [📎] [⌘]   │ │     Attachment upload / shortcuts
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

### 4.5 Right Context Panel (Right Panel)

Only visible in the conversation flow view (hidden in the file browser view). Kept minimal for the current phase — only two sections:

```
┌──────────────────┐
│ ▾ Progress       │  ← Task progress tracking
│   ✅ Analyze existing schema │
│   ✅ Design multi-tenancy plan │
│   🔄 Generate migration script │  ← In progress
│   ⬜ Write test cases        │
│                  │
│ ▾ Artifacts      │  ← Task artifact list
│   📄 schema-v2.sql│  ← Click to preview / open with default app
│   📄 migration.sql│
│   📄 design.md   │
│                  │
└──────────────────┘
```

**Section responsibilities:**

- **Progress**: Extracts task steps from AI responses. OpenClaw Agents typically output step lists or todos when executing complex tasks; the client parses these structured outputs and renders them as a progress tracker. If the AI hasn't output structured steps, this section is hidden.
- **Artifacts**: Lists all artifact files for the current Task, reverse chronological. Clicking a file opens a preview (inline Markdown/code preview, image thumbnails) or opens with the system default application.

**Future expandable sections** (not in MVP scope): Context (tags, creation time, and other metadata), Related Tasks, Agent Config (current Agent configuration info).

---

## 5. Development Plan (Vibe Coding Mode)

> **Development strategy**: Full Vibe Coding — tasks are broken down to a granularity that a single Agent session can independently complete. Multiple independent tasks can be assigned to different Agents in parallel. Each task has a clear acceptance checkpoint (✅ Check); once met, proceed to the next.

### Phase 1: Project Scaffold + OpenClaw Communication

**Goal: Complete the minimum loop — "Launch app → Connect to OpenClaw → Send a message → Receive a reply"**

#### 1.1 Project Initialization (Parallelizable)

- [x] **T1-0** Initialize monorepo scaffold: pnpm workspace + `packages/shared` + `packages/desktop` + tsconfig.base.json
  - ✅ Check: `pnpm install` succeeds; packages can reference each other's types without errors
- [x] **T1-1** `packages/desktop`: Initialize Electron app with electron-vite (React 19 + TS + Tailwind v4)
  - ✅ Check: `pnpm --filter @clawwork/desktop dev` launches a blank Electron window
- [x] **T1-2** ~~`packages/channel-plugin`~~ (removed in the Gateway-Only refactor; code retained but not built)
- [x] **T1-3** `packages/shared`: Define Gateway protocol types + Task/Message/Artifact types
  - ✅ Check: desktop package can import types from `@clawwork/shared`

#### 1.2 Three-Panel Layout Scaffold

- [x] **T1-4** Implement three-panel layout component (Left Nav 260px + Main Area flex + Right Panel 320px), collapsible right panel
  - ✅ Check: Three panels render responsively; right panel can be collapsed/expanded
- [x] **T1-5** Left Nav: Static structure (New Task button + Search entry + Files entry + empty Task list + Settings entry)
  - ✅ Check: All buttons clickable; console.log confirms event bindings

#### 1.3 OpenClaw Communication Pipeline

- [x] **T1-7** Electron main process: WebSocket client connecting to OpenClaw Gateway (ws://127.0.0.1:18789), with challenge-response auth
  - ✅ Check: Connection established, heartbeat normal, auto-reconnect on disconnect
- [x] **T1-8** Implement message sending: Electron → Gateway (chat.send) with sessionKey + idempotencyKey
  - ✅ Check: Manually send a message from Electron DevTools console; OpenClaw Agent receives and replies
- [x] **T1-9** Implement message receiving + sessionKey routing: Gateway chat events forwarded to renderer via IPC, dispatched to corresponding Task by sessionKey
  - ✅ Check: Messages from different sessionKeys don't cross-contaminate

**Phase 1 Acceptance: Can complete a round-trip conversation with OpenClaw Agent from the blank Electron page via code**

---

### Phase 2: Core UI Interactions

**Goal: Complete Task conversation experience, usable for daily work**

#### 2.1 Task Management

- [x] **T2-1** New Task flow: click button → create local Task record → auto-set as active → navigate to conversation view
  - ✅ Check: After creating a Task, a new entry appears in the left-side list; Main Area switches to an empty conversation page
- [x] **T2-2** Task list rendering: grouped by status (Active → Completed → Archived), reverse chronological within groups, selected item highlighted
  - ✅ Check: Clicking different Tasks switches the conversation content displayed in the Main Area
- [x] **T2-3** Task state transitions: active → completed → archived, via ContextMenu component + useTaskContextMenu hook
  - ✅ Check: State changes are immediately reflected in the UI

#### 2.2 Conversation Flow Components

- [x] **T2-4** Message rendering component: user / assistant / system role differentiation, Markdown rendering (react-markdown + rehype-highlight)
  - ✅ Check: Code blocks have syntax highlighting; links are clickable
- [x] **T2-5** Input box component: Shift+Enter for newline, Enter to send, clears after sending, auto-expanding textarea height
  - ✅ Check: After sending a message → Agent replies → message stream auto-scrolls to bottom
- [x] **T2-6** Streaming response rendering: Gateway chat event delta accumulation + blinking cursor animation
  - ✅ Check: Long replies appear incrementally rather than as a complete block
- [x] **T2-7** Tool-call collapsible block: AI tool_use rendered as expandable/collapsible card (tool name + arguments + result)
  - ✅ Check: Tool calls are collapsed by default; click to expand and see details

#### 2.3 Right Panel

- [x] **T2-8** Progress section: Parse `- [x]`/`- [ ]` patterns in AI responses, render as a checklist
  - ✅ Check: When AI outputs a todo list, the progress tracker appears automatically on the right; hidden when there are no todos
- [x] **T2-9** Artifacts section: List artifact files for the current Task (extracted from message artifacts field)
  - ✅ Check: After Agent generates files, the Artifacts list updates automatically

#### 2.4 Multi-Task Parallel Verification

- [ ] **T2-10** Open 3 active Tasks simultaneously; while waiting for a reply on A, switch to B and send a message — verify no cross-contamination
  - ✅ Check: Each Task's message stream is independent; the left-side list shows unread badges for background Tasks with new messages

**Phase 2 Acceptance: Can have parallel multi-task conversations like Claude Cowork, with Progress and Artifacts displayed on the right**

---

### Phase 3: Artifact Management + File System

**Goal: Artifacts auto-persist; global file browsing**

#### 3.1 Artifact Persistence

- [x] **T3-1** Workspace config persistence: `app.getPath('userData')/clawwork-config.json`, Setup wizard
  - ✅ Check: First launch shows Setup wizard; after selecting a directory, config is written to JSON
- [x] **T3-2** SQLite database initialization: `better-sqlite3` + Drizzle ORM, tasks/messages/artifacts tables, DB file at `<workspacePath>/.clawwork.db` (WAL mode)
  - ✅ Check: DB file is auto-created; Drizzle schema matches the table structure
- [x] **T3-3** Artifact persistence + Git auto-commit: artifact files copied to workspace task dir + SQLite insert + simple-git add/commit
  - ✅ Check: `git log` shows commits for artifact changes

#### 3.2 File Browser

- [x] **T3-4** File browser Main Area view: FileBrowser layout, search bar + type filter tabs + grid list, data from IPC
  - ✅ Check: Click the Files entry on the left → Main Area switches to file browser; right panel is hidden
- [x] **T3-5** File card component: FileCard, icon + filename + date + parent Task name
  - ✅ Check: Sorted reverse chronologically; file type filtering works correctly
- [x] **T3-6** File → Task navigation + file preview: Click a file card to navigate to the corresponding Task conversation, highlighting the message that produced the file (2s fade animation); FilePreview component supports Markdown/code/image
  - ✅ Check: After navigating from the file browser, the target message scrolls into view with a highlight animation
- [x] **T3-7** IPC layer: workspace/artifact/settings IPC handlers fully implemented
  - ✅ Check: All file browser data comes through IPC; mock data has been removed

**Phase 3 Acceptance: Artifacts auto-save to local Git Repo; file browser supports filtering by type and search**

---

### Phase 3.5: Design System + Full UI Overhaul + Premium Depth Pass

**Goal: Upgrade from prototype-grade UI to production-grade UI; establish a complete design system**

#### 3.5.1 Design System Infrastructure

- [x] **T3.5-0** Install dependencies: framer-motion, cva, Radix UI suite (@radix-ui/react-collapsible, @radix-ui/react-dropdown-menu, @radix-ui/react-scroll-area, @radix-ui/react-tabs, @radix-ui/react-tooltip), @fontsource-variable/inter, @fontsource-variable/jetbrains-mono, clsx, tailwind-merge
  - ✅ Check: All dependencies installed without version conflicts
- [x] **T3.5-1** Design system definition: `design-system.md` spec doc + `design-tokens.ts` TS constants (colors, spacing, radius, typography, shadows, transitions, motion presets) + shadcn/ui base components (Button, ScrollArea, Collapsible, Tabs, DropdownMenu, Tooltip)
  - ✅ Check: All token values are consistent between TS and CSS

#### 3.5.2 Foundation Refactor

- [x] **T3.5-2** theme.css rewrite: CSS @import for fonts, @layer base wrapping custom styles, extended CSS Variables (full dark+light dual-mode coverage)
  - ✅ Check: No unlayered global styles (avoiding Tailwind utility overrides)

#### 3.5.3 Component Refactor (shadcn/ui + Framer Motion)

- [x] **T3.5-3** All business components rewritten with shadcn/ui + motion: ChatMessage (motion.div listItem), ChatInput (Button + motion), StreamingMessage (motion.div fadeIn), ToolCallCard (Radix Collapsible + AnimatePresence), FileCard (motion.button), FilePreview (ScrollArea)
  - ✅ Check: All components use cn() for class merging, colors via CSS Variables, animations use motion presets

#### 3.5.4 Layout Refactor

- [x] **T3.5-4** All layout components rewritten: LeftNav (TaskItem extracted as independent component + DropdownMenu context menu + Tooltip), MainArea (AnimatePresence view switching + welcome screen), RightPanel (Tabs component), FileBrowser (AnimatePresence preview), Settings, Setup, App.tsx (TooltipProvider wrapper)
  - ✅ Check: Layout components all use shadcn/ui base components + motion animations

#### 3.5.5 Cleanup + Verification

- [x] **T3.5-5** Remove dead code: `useAgentMessages.ts` (superseded by `useGatewayDispatcher.ts`)
- [x] **T3.5-6** Verification passed: tsc --noEmit zero errors, dev server starts normally, UI screenshots confirm correct rendering

#### 3.5.6 Visual Polish — Font/Size Bump

- [x] **T3.5-7** Global size adjustments (13 files): base font 13→14px, avatar/icon/button sizes increased, border radius unified, section labels use text-xs for hierarchy, Button danger variant hardcoded hex → CSS Variables

#### 3.5.7 Visual Polish — Premium Depth Pass

- [x] **T3.5-8** Premium CSS Variables: 12 new tokens (`--accent-hover`, `--accent-soft`, `--accent-soft-hover`, `--bg-elevated`, `--ring-accent`, `--glow-accent`, `--shadow-elevated`, `--shadow-card`, `--border-subtle`, `--danger`, `--danger-bg`), dark + light dual-mode values
- [x] **T3.5-9** CSS utility classes: `.surface-elevated`, `.glow-accent`, `.ring-accent-focus` defined in `@layer base`
- [x] **T3.5-10** Button `soft` variant: `--accent-soft` background + accent text (softer than the full-fill `default`); used for ChatInput send button and LeftNav "New Task" button
- [x] **T3.5-11** All Button variants gain `active:scale-[0.98]` press feedback
- [x] **T3.5-12** ChatInput: `--bg-elevated` + `--shadow-elevated` + `ring-accent-focus` focus ring
- [x] **T3.5-13** WelcomeScreen: radial glow behind logo + "AI-powered task execution" subtitle + typography hierarchy
- [x] **T3.5-14** TaskItem: active state left-side 3px accent bar + `whileHover={{ x: 2 }}` micro-interaction
- [x] **T3.5-15** ToolCallCard: left status bar (running=pulse, done=semi-transparent, error=red) + shadow-card
- [x] **T3.5-16** tabs.tsx size adjustments: h-8→h-9, px-2.5→px-3, active uses `--bg-elevated` + `--shadow-card`
- [x] **T3.5-17** dropdown-menu.tsx: hardcoded colors → CSS Variables (`--danger`, `--danger-bg`), content uses `--bg-elevated` + `--shadow-elevated`
- [x] **T3.5-18** Setup page: radial glow + form card container

**Phase 3.5 Acceptance: tsc --noEmit zero errors, dev server starts normally, UI screenshots confirm premium depth effects**

---

### Phase 4: Polish + Distribution

**Goal: A complete product ready to distribute to others**

#### 4.1 Experience Optimization

- [x] **T4-1** Theme system: dark / light theme toggle, CSS Variables + Tailwind v4
  - ✅ Check: Theme can be toggled in Settings; all components follow the change
- [x] **T4-2** Global search: Task titles + filenames + message content full-text search (SQLite FTS5)
  - ✅ Check: Search results are clickable and navigate to the corresponding Task or file
- [x] **T4-3** Settings page: OpenClaw Server address config + Workspace path config + theme toggle
  - ✅ Check: After changing the Server address, reconnection succeeds
- [x] **T4-4** Error handling + reconnection: WebSocket disconnect notification, reconnect animation, offline state display
  - ✅ Check: Disconnect cable → shows disconnect notification → reconnects automatically after recovery

#### 4.2 Packaging & Distribution

- [ ] **T4-5** electron-builder configuration: macOS dmg (Universal Binary: `--arch universal`)
  - ✅ Check: Both Apple Silicon and Intel Macs can install and run
- [ ] **T4-6** App icon + splash screen + app metadata (name/version/description)
  - ✅ Check: After dmg installation, the app icon is correct and About info is complete

**Phase 4 Acceptance: Generate a .dmg file; new users can install and use it after configuring the OpenClaw address**

---

### Task Dependency Graph (Vibe Coding Parallel Guide)

```
Phase 1:
  T1-0 ──→ T1-1 ─────┐
           T1-3 ─────┘──→ T1-7 → T1-8 → T1-9
           T1-4 ─┬──→ (Phase 2 UI tasks depend on these)
           T1-5 ─┘

  T1-0 goes first (monorepo scaffold, prerequisite for all subsequent tasks)
  Parallelizable: [T1-1, T1-3] — 2 Agents simultaneously
                  [T1-4, T1-5] — 2 Agents simultaneously (no dependency on above group, also parallelizable)

Phase 2:
  T2-1 → T2-2 → T2-3 (serial: Task CRUD chain)
  T2-4 → T2-5 → T2-6 → T2-7 (serial: conversation flow component progression)
  T2-8 ─┐
  T2-9 ─┘ parallelizable (two independent right-panel sections)
  T2-10 after all Phase 2 tasks are complete

  Parallelizable: [T2-1..T2-3] and [T2-4..T2-7] — two chains can progress simultaneously
                  [T2-8, T2-9] — 2 Agents simultaneously

Phase 3:
  T3-1 → T3-2 → T3-3 (serial: artifact persistence chain)
  T3-4 → T3-5 → T3-6 → T3-7 (serial: file browser progression)

  Parallelizable: [T3-1..T3-3] and [T3-4..T3-7] — two chains can progress simultaneously

Phase 4:
  [T4-1, T4-2, T4-3, T4-4] all parallelizable (4 Agents simultaneously)
  T4-5 → T4-6 (serial: packaging chain)
```

---

## 6. Tech Stack

### 6.1 Monorepo Project Structure

The entire project uses a pnpm workspace-managed monorepo with all code in a single repository:

```
clawwork/
├── package.json                 # workspace root
├── pnpm-workspace.yaml          # pnpm workspace config
├── tsconfig.base.json           # shared TS config (ES2022, strict, bundler resolution)
│
├── packages/
│   ├── shared/                  # @clawwork/shared — zero-dependency type bridge
│   │   ├── package.json
│   │   └── src/
│   │       ├── types.ts         # Task, Message, Artifact, ToolCall, ProgressStep
│   │       ├── protocol.ts      # WsMessage union type + type guards
│   │       ├── gateway-protocol.ts  # GatewayFrame types, GatewayConnectParams
│   │       ├── constants.ts     # port numbers, buildSessionKey(), parseTaskIdFromSessionKey()
│   │       └── index.ts         # barrel export
│   │
│   ├── channel-plugin/          # (excluded from workspace; code retained but not built)
│   │
│   └── desktop/                 # @clawwork/desktop — Electron desktop app
│       ├── package.json
│       ├── electron.vite.config.ts
│       └── src/
│           ├── main/            # Electron main process
│           │   ├── index.ts     # hiddenInset titleBar, auto-screenshot
│           │   ├── ws/
│           │   │   ├── gateway-client.ts  # GatewayClient: challenge-response auth, heartbeat, reconnect
│           │   │   ├── window-utils.ts    # BrowserWindow helpers
│           │   │   └── index.ts           # initWebSockets, getters, destroy
│           │   └── ipc/
│           │       └── ws-handlers.ts     # IPC handlers
│           ├── preload/
│           │   ├── index.ts     # buildApi() factory, contextBridge
│           │   └── clawwork.d.ts
│           └── renderer/        # React renderer process
│               ├── App.tsx      # Three-panel layout (260px | flex | 320px)
│               ├── stores/      # Zustand stores (taskStore, messageStore, uiStore)
│               ├── styles/      # theme.css + design-tokens.ts
│               ├── lib/         # utils.ts, session-sync.ts
│               ├── components/  # ChatMessage, ChatInput, StreamingMessage, ToolCallCard, FileCard, FilePreview
│               │   └── ui/      # shadcn/ui base components
│               ├── hooks/       # useGatewayDispatcher, useTheme
│               └── layouts/     # LeftNav/, MainArea/, RightPanel/, FileBrowser/, Settings/, Setup/
```

**`pnpm-workspace.yaml`:**

```yaml
packages:
  - 'packages/shared'
  - 'packages/desktop'
```

**Inter-package Dependencies:**

```
@clawwork/shared ← @clawwork/desktop
```

`@clawwork/shared` is the type bridge, defining Gateway communication types and the data models used by Desktop. `composite: true` + `references` ensures cross-package type safety.

**Common Development Commands:**

```bash
# Install all dependencies
pnpm install

# Dev Desktop App (hot-reload)
pnpm --filter @clawwork/desktop dev

# Type-check (tsc lives under desktop/node_modules only)
packages/desktop/node_modules/.bin/tsc -b packages/shared/tsconfig.json
packages/desktop/node_modules/.bin/tsc --noEmit -p packages/desktop/tsconfig.json

# Package
pnpm --filter @clawwork/desktop build
```

### 6.2 Tech Stack Overview

```
clawwork (pnpm monorepo)
├── @clawwork/shared            # shared types + protocol definitions
│   └── TypeScript 5.x
├── @clawwork/desktop            # Electron desktop app
│   ├── Renderer process
│   │   ├── React 19 + TypeScript 5.x
│   │   ├── Zustand 5 (state management: taskStore, messageStore, uiStore)
│   │   ├── shadcn/ui (Radix UI + cva + tailwind-merge)
│   │   ├── Framer Motion (animation)
│   │   ├── Tailwind CSS v4 + CSS Variables (theming)
│   │   └── react-markdown + rehype-highlight (Markdown rendering)
│   ├── Main process
│   │   ├── ws/ (GatewayClient → Gateway :18789)
│   │   ├── better-sqlite3 + Drizzle ORM
│   │   └── simple-git
│   ├── Build: Vite 6 + electron-vite 3
│   └── Packaging: electron-builder (macOS Universal Binary)
└── Toolchain
    ├── pnpm 10 workspace (monorepo management)
    ├── lucide-react (icons)
    └── Inter Variable + JetBrains Mono (fonts)
```

### 6.3 UI Component Choices

- **shadcn/ui** — headless components, no style lock-in
- **lucide-react** — icons
- **@tanstack/react-virtual** — virtual scrolling for long message lists
- **react-markdown + rehype-highlight** — Markdown and code syntax highlighting in messages

### 6.4 Theme System

```css
:root[data-theme="dark"] {
  --bg-primary: #1C1C1C;
  --bg-secondary: #242424;
  --bg-tertiary: #2A2A2A;
  --accent: #0FFD0D;
  --text-primary: #F3F4F4;
  --text-secondary: #9CA3AF;
  --border: rgba(255, 255, 255, 0.08);
  --border-accent: rgba(15, 253, 93, 0.15);
}

:root[data-theme="light"] {
  --bg-primary: #FAFAFA;
  --bg-secondary: #FFFFFF;
  --bg-tertiary: #F3F4F6;
  --accent: #0B8A0A;
  --text-primary: #111827;
  --text-secondary: #6B7280;
  --border: rgba(0, 0, 0, 0.08);
  --border-accent: rgba(11, 138, 10, 0.15);
}
```

---

## 7. Key Design Decision Records

### ADR-001: Why Gateway-Only Instead of Channel Plugin

**Decision**: Implement the full conversation flow via direct Gateway WebSocket connection, without using a Channel Plugin dual-channel setup.

**Rationale**:
- A single Gateway channel handles the complete conversation flow (`chat.send` + `chat`/`agent` events); no additional Plugin layer needed
- One fewer IPC channel reduces architectural complexity and debugging costs
- Avoids Channel Plugin validation bugs ([#12484]) and configuration complexity
- The `deliver: false` parameter ensures messages don't go through external channels — only through Gateway events

**History**:
- An earlier design featured a Channel Plugin dual-channel architecture (Plugin ran inside OpenClaw, communicating with Desktop via :13579 WS)
- During implementation, we confirmed that a single Gateway channel suffices; the Plugin dependency was removed in the Gateway-Only refactor (G1-G9)
- `packages/channel-plugin` code is retained but excluded from the workspace

### ADR-002: Why Git Repo Instead of Pure SQLite

**Decision**: Filesystem + SQLite index + Git versioning.

**Rationale**:
- Artifact files (code, docs, images) are naturally suited to filesystem storage; storing blobs in SQLite is inappropriate
- Git provides free version traceability — users can see the change history for each Task's artifacts
- If multi-device sync is needed in the future, git remote is a ready-made infrastructure
- SQLite handles indexing and full-text search only, staying lightweight

**Trade-offs**:
- Git is not ideal for large binary files (>100MB images/videos). If large file support is needed later, consider git-lfs or a separate file storage strategy
- Auto-commits create extensive git history; periodic gc or retention limits may be needed

### ADR-003: Why Electron Instead of Tauri

**Decision**: Use Electron.

**Rationale**:
- OpenClaw itself is a TypeScript ecosystem; Electron maintains tech-stack consistency
- shadcn/ui and the React ecosystem are mature, with high component reusability
- Electron's Node integration makes SQLite, git operations, and filesystem access more straightforward
- For a three-panel layout app requiring heavy UI interaction, Electron's Chromium rendering engine is more stable

**Trade-offs**:
- Larger bundle size (~150MB); Tauri would be much smaller
- Higher memory usage, but acceptable for a desktop developer tool

---

## 8. Risks & Open Items

| Risk | Impact | Mitigation |
|------|------|----------|
| Incomplete OpenClaw Gateway protocol docs | Blocks Phase 1 | Read source code first; reverse-engineer by referencing feishu plugin implementation |
| Gateway broadcasts all session events [#32579] | Client receives messages from unrelated sessions; adds filtering overhead | Client-side filtering by sessionKey; performance impact is manageable |
| `mediaLocalRoots` security check [#20258] [#36477] | File sends may be rejected | Properly configure the mediaLocalRoots parameter |
| Session auto-reset at 4 AM | Long-running Task conversation context gets cleared | Server-side config to disable auto-reset |
| Git auto-commit performance | Slow commits with many small files | Batch commits + debounce |
| macOS code signing and notarization | Users unable to install | Handle in Phase 4; use ad-hoc signing during development |

---

## 9. Appendix: Reference Resources

**Official Documentation:**
- OpenClaw main repo: https://github.com/openclaw/openclaw
- OpenClaw Channel docs: https://docs.openclaw.ai/cli/channels
- Gateway protocol: https://docs.openclaw.ai/gateway/protocol
- Session management: https://docs.openclaw.ai/concepts/session
- Session compaction & persistence: https://docs.openclaw.ai/reference/session-management-compaction
- Command queue system: https://docs.openclaw.ai/concepts/queue

**Channel Plugin Reference Implementations (historical reference):**
- Feishu Plugin: https://github.com/xzq-xu/openclaw-plugin-feishu
- DingTalk Plugin: https://github.com/soimy/openclaw-channel-dingtalk
- Channel Plugin development guide: https://zread.ai/openclaw/openclaw/16-channel-plugin-development

**Known Issues (to follow up):**
- sendMedia mediaLocalRoots: https://github.com/openclaw/openclaw/issues/20258
- Slack mediaLocalRoots regression: https://github.com/openclaw/openclaw/issues/36477
- Gateway broadcast without session filtering: https://github.com/openclaw/openclaw/issues/32579
