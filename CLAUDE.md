# CLAUDE.md — ClawWork Project Guide

## Project Overview

ClawWork is an OpenClaw desktop client inspired by Claude Cowork: three-panel layout, parallel multi-task execution, and structured progress tracking. It adds file management capabilities on top — all AI artifacts are automatically persisted to a local Git repo, searchable and traceable.

**Not** an OpenClaw admin console. **Not** a general-purpose IM client. **Not** a collaboration tool.

## Architecture

```
┌─────────────────────┐       ┌──────────────────────────┐
│ OpenClaw Server      │  WS   │ ClawWork Desktop App     │
│ (Node.js process)    │◄────►│ (Electron 34 process)     │
│                     │       │                          │
│ ┌─────────────────┐ │       │  React 19 UI             │
│ │ Gateway :18789  │ │       │  SQLite (metadata index)  │
│ │ Agent Engine    │ │       │  Git Repo (artifact VCS)  │
│ └─────────────────┘ │       │                          │
└─────────────────────┘       └──────────────────────────┘
```

**Gateway-Only Architecture (single WS connection):**

Desktop → Gateway (:18789): `chat.send` sends user messages (`deliver: false` — no external channel delivery), receives Agent streaming replies via `event:"chat"`, and receives tool-call events via `event:"agent"` + `caps:["tool-events"]`.

> Historical note: An earlier version used a Desktop↔Plugin dual-channel architecture, which was fully removed during the Gateway-Only refactor (G1-G9). The `packages/channel-plugin` code remains in the repo but is excluded from the workspace.

## Monorepo Structure

```
./
├── package.json              # pnpm workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json        # ES2022, strict, bundler resolution
├── packages/
│   ├── shared/               # @clawwork/shared — zero-dependency type bridge
│   │   └── src/
│   │       ├── types.ts      # Task, Message, Artifact, ToolCall, ProgressStep
│   │       ├── protocol.ts   # WsMessage union type + type guards
│   │       ├── gateway-protocol.ts  # GatewayFrame types, GatewayConnectParams
│   │       ├── constants.ts  # port numbers, buildSessionKey(), parseTaskIdFromSessionKey()
│   │       └── index.ts      # barrel export
│   ├── channel-plugin/       # (excluded from workspace; code retained but not built)
│   └── desktop/              # @clawwork/desktop — Electron app
│       ├── electron.vite.config.ts  # React + Tailwind v4 vite plugin
│       └── src/
│           ├── main/
│           │   ├── index.ts         # Electron main process, hiddenInset titleBar
│           │   ├── ws/
│           │   │   ├── gateway-client.ts  # GatewayClient: challenge-response auth, heartbeat, reconnect
│           │   │   ├── device-identity.ts # Ed25519 keypair, device auth signing, device token persistence
│           │   │   ├── window-utils.ts    # BrowserWindow helpers
│           │   │   └── index.ts           # initWebSockets, getters, destroy
│           │   └── ipc/
│           │       └── ws-handlers.ts     # IPC handlers: send-message, chat-history, list-sessions, gateway-status
│           ├── preload/
│           │   ├── index.ts         # buildApi() factory, contextBridge
│           │   └── clawwork.d.ts    # ClawWorkAPI interface
│           └── renderer/
│               ├── index.html
│               ├── main.tsx         # React entry
│               ├── App.tsx          # Three-panel layout (260px | flex | 320px)
│               ├── stores/
│               │   ├── taskStore.ts     # Task CRUD, activeTaskId
│               │   ├── messageStore.ts  # messagesByTask, streamingByTask
│               │   └── uiStore.ts       # rightPanelOpen, unreadTaskIds
│               ├── styles/
│               │   ├── theme.css            # Tailwind v4 + CSS Variables + Inter/JetBrains Mono
│               │   └── design-tokens.ts     # TS design tokens (colors, spacing, motion presets)
│               ├── lib/
│               │   ├── utils.ts             # cn(), formatRelativeTime(), formatFileSize()
│               │   └── session-sync.ts      # Session state sync logic
│               ├── components/
│               │   ├── ui/                  # shadcn/ui base components (Button, ScrollArea, Tabs, etc.)
│               │   ├── ChatMessage.tsx      # Markdown rendering + motion.div listItem
│               │   ├── ChatInput.tsx        # Button + motion, Enter/Shift+Enter
│               │   ├── StreamingMessage.tsx  # motion.div fadeIn + cursor animation
│               │   ├── ToolCallCard.tsx     # Radix Collapsible + AnimatePresence
│               │   ├── ContextMenu.tsx      # useTaskContextMenu hook (component removed)
│               │   ├── FileCard.tsx         # motion.button file card
│               │   └── FilePreview.tsx      # File preview panel
│               ├── hooks/
│               │   ├── useGatewayDispatcher.ts  # Gateway chat events → stores
│               │   └── useTheme.ts              # Theme toggle hook
│               └── layouts/
│                   ├── LeftNav/     # TaskItem extraction, DropdownMenu context menu, Tooltip
│                   ├── MainArea/    # AnimatePresence view switching, welcome screen
│                   ├── RightPanel/  # Tabs (Progress/Artifacts/Git), ScrollArea
│                   ├── FileBrowser/ # File browser + AnimatePresence preview
│                   ├── Settings/    # Settings page
│                   └── Setup/       # Initial setup wizard
```

### Inter-package Dependencies

```
@clawwork/shared ← @clawwork/desktop
```

`@clawwork/shared` has `composite: true` in its tsconfig; desktop references it via `references`.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Electron 34 + electron-vite 3 |
| Frontend | React 19, TypeScript 5.x, Tailwind CSS v4 |
| UI Components | shadcn/ui (Radix UI + cva + tailwind-merge) |
| Animation | Framer Motion |
| Fonts | Inter Variable (UI) + JetBrains Mono (code) |
| State Management | Zustand 5 |
| Database | better-sqlite3 + Drizzle ORM |
| Git Operations | simple-git |
| Icons | lucide-react |
| Build | Vite 6 (via electron-vite) |
| Packaging | electron-builder (macOS Universal Binary) |
| Package Manager | pnpm 10 workspace |

## Development Commands

```bash
# Install all dependencies
pnpm install

# Dev Desktop App (Electron hot-reload)
pnpm --filter @clawwork/desktop dev

# Type-check (note: tsc lives under desktop/node_modules; pnpm exec tsc won't work)
# Must build shared first (composite: true), then check desktop
packages/desktop/node_modules/.bin/tsc -b packages/shared/tsconfig.json
packages/desktop/node_modules/.bin/tsc --noEmit -p packages/desktop/tsconfig.json

# Package
pnpm --filter @clawwork/desktop build
```

## Key Protocols

### Session Key Format

```
agent:main:clawwork:task:<taskId>
```

Each Task maps to an independent OpenClaw session. Sessions execute in parallel; messages within a session are serial. Gateway broadcasts all session events (no filtering); the client routes by sessionKey to the corresponding Task.

### Gateway WebSocket Protocol

Desktop communicates with Gateway (:18789) via a single WS connection:

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

### File Transfer

MVP assumes co-located deployment only: artifact files are copied directly to the workspace artifact directory via local paths.

Note the `mediaLocalRoots` security check (v2026.3.2+).

## Theme System

Driven by CSS Variables; dark is the default. Toggle via `<html data-theme="dark|light">`.

Core accent: green `#0FFD0D` (dark) / `#0B8A0A` (light); background `#1C1C1C` / `#FAFAFA`.

All colors are referenced via `var(--xxx)` — no hardcoded hex values.

## Current Progress

### Phase 1 — Complete ✅ (commits `375154c`, `c882b4e`)

- **T1-0** Monorepo scaffold (pnpm workspace, tsconfig, .gitignore, git init)
- **T1-1** Desktop package (Electron main, preload, renderer entry, theme CSS)
- **T1-2** ~~Channel Plugin~~ (removed in the Gateway-Only refactor; code retained but not built)
- **T1-3** Shared types (types.ts, protocol.ts, gateway-protocol.ts, constants.ts) — Drizzle ORM schema pending
- **T1-4** Three-panel layout (App.tsx: 260px LeftNav | flex MainArea | 320px RightPanel, right panel collapsible)
- **T1-5** LeftNav static structure (New Task button, search box, file manager entry, sample task list, settings)
- **T1-7** Electron main-process WS client: Gateway challenge-response auth, heartbeat, exponential-backoff reconnect
- **T1-8** Message sending: Electron → Gateway (chat.send) with idempotencyKey
- **T1-9** Message receiving: Gateway events forwarded to renderer via IPC; useAgentMessages hook routes by sessionKey

**Phase 1 acceptance met: completed a round-trip conversation with Agent via `window.clawwork.sendMessage()` in Electron DevTools; events returned correctly.**

### Phase 2 — Complete ✅ (commit `bc220ad`)

- **T2-0** Install zustand, react-markdown, rehype-highlight
- **T2-1** New Task flow: taskStore.createTask() — creates a task and automatically sets it as active
- **T2-2** Task list rendering: reads taskStore dynamically, grouped by status (Active → Completed → Archived), reverse-chronological within groups
- **T2-3** Context menu: ContextMenu component + useTaskContextMenu hook, state transitions active→completed→archived
- **T2-4** ChatMessage component: Markdown rendering (react-markdown + rehype-highlight), role differentiation (user/assistant/system)
- **T2-5** ChatInput component: Shift+Enter for newline, Enter to send, auto-expanding textarea height
- **T2-6** StreamingMessage component: streaming response delta accumulation + blinking cursor animation
- **T2-7** ToolCallCard component: collapsible tool-call card showing arguments/result
- **T2-8** Progress panel: extracts `- [x]`/`- [ ]` patterns from AI messages, displays progress steps
- **T2-9** Artifacts panel: lists file artifacts from message artifacts field
- **Bug fix** Zustand selector infinite loop: removed getter methods from store, switched to direct state access + EMPTY_MESSAGES sentinel value
- **Bug fix** Gateway chat event parsing: content is at `payload.message.content[]`, not `payload.content[]`
- **Preload refactor** buildApi() factory function, fixed type errors

### Deferred

- **T2-10** Multi-task parallel verification: functionality is ready but not systematically tested

### Phase 3 — Complete ✅ (commit `TBD`)

- **T3-1** Workspace config persistence: `app.getPath('userData')/clawwork-config.json`, Setup wizard
- **T3-2** SQLite database initialization: `better-sqlite3`, tasks/messages/artifacts tables, DB file at `<workspacePath>/.clawwork.db`
- **T3-3** Artifact persistence: artifact files copied to workspace, DB records created, Git auto-commit (simple-git)
- **T3-4** File browser UI: FileBrowser layout, FileCard component, search + filter + type grouping
- **T3-5** File preview panel: FilePreview component, code/text/image preview
- **T3-6** IPC layer: workspace/artifact/settings IPC handlers

### Phase 3.5 — Complete ✅ (pending commit)

Design System + full UI overhaul: shadcn/ui + Framer Motion + Inter/JetBrains Mono fonts

- **T3.5-0** Install dependencies: framer-motion, cva, Radix UI suite, @fontsource-variable/*
- **T3.5-1** Design system definition: `design-system.md` spec + `design-tokens.ts` TS constants + shadcn/ui base components
- **T3.5-2** Foundation refactor: theme.css rewrite (font imports, @layer base, extended CSS variables)
- **T3.5-3** Component refactor: ChatMessage, ChatInput, StreamingMessage, ToolCallCard, FileCard, FilePreview — all rewritten with shadcn/ui + motion
- **T3.5-4** Layout refactor: LeftNav (TaskItem extraction + DropdownMenu), MainArea (AnimatePresence), RightPanel (Tabs), FileBrowser, Settings, Setup, App.tsx (TooltipProvider)
- **T3.5-5** Cleanup: removed useAgentMessages.ts dead code
- **T3.5-6** Verification passed: tsc --noEmit zero errors, dev server starts normally, UI screenshots confirm correct rendering

### Phase 3.5 Visual Polish — Complete ✅ (pending commit)

**Font/Size Bump (13 files):**
- **T3.5-7** Base font 13→14px, avatar/icon/button sizes increased, border radius unified, section labels text-xs, Button danger variant hex→CSS vars

**Premium Depth Pass (10 items, all verified):**
- **T3.5-8** theme.css: 12 new premium CSS Variables (dark+light): `--accent-hover`, `--accent-soft`, `--accent-soft-hover`, `--bg-elevated`, `--ring-accent`, `--glow-accent`, `--shadow-elevated`, `--shadow-card`, `--border-subtle`, `--danger`, `--danger-bg`
- **T3.5-9** 3 CSS utility classes: `.surface-elevated`, `.glow-accent`, `.ring-accent-focus`
- **T3.5-10** button.tsx: new `soft` variant + all variants `active:scale-[0.98]` + focus ring `--ring-accent`
- **T3.5-11** ChatInput: `--bg-elevated` + `--shadow-elevated` + `ring-accent-focus`, send button → `soft` variant
- **T3.5-12** MainArea WelcomeScreen: radial glow + subtitle + typography hierarchy
- **T3.5-13** LeftNav "New Task" button: `default` → `soft` variant
- **T3.5-14** TaskItem: active left-side 3px accent bar + `whileHover={{ x: 2 }}` micro-interaction
- **T3.5-15** ToolCallCard: left status bar (running=pulse, done=accent, error=red) + shadow-card
- **T3.5-16** tabs.tsx: sizes increased, active uses `--bg-elevated` + `--shadow-card`
- **T3.5-17** dropdown-menu.tsx: hardcoded colors → CSS Variables, content uses `--bg-elevated` + `--shadow-elevated`
- **T3.5-18** Setup page: radial glow + elevated card form container

### Upcoming Phases

- **Phase 4** — Polish + packaging (T4-1 ~ T4-7): theme toggle, global search (FTS5), Settings, error handling, electron-builder dmg

## Task Dependency Graph

```
Phase 1:
  T1-0 → T1-1 ─────┐
         T1-3 ─────┘→ T1-7 → T1-8 → T1-9
         T1-4 ─┬→ (Phase 2 UI depends on these)
         T1-5 ─┘

Phase 2:
  [T2-1 → T2-2 → T2-3]   Task CRUD chain (serial)
  [T2-4 → T2-5 → T2-6 → T2-7]   Chat flow components (serial)
  [T2-8, T2-9]   Right panel (parallelizable)
  T2-10   Multi-task verification (after all Phase 2 tasks)

Phase 3:
  [T3-1 → T3-2 → T3-3]   Artifact persistence (serial)
  [T3-4 → T3-5 → T3-6 → T3-7]   File browser (serial)
  Both chains can run in parallel

Phase 4:
  [T4-1, T4-2, T4-3, T4-4]   All parallelizable
  T4-5 → T4-6 → T4-7   Packaging chain (serial)
```

## Technical Discoveries (Lessons Learned)

### Gateway Protocol Key Details

1. **Challenge-response auth**: Server sends `connect.challenge` (containing nonce) first; client must reply with a `connect` request (protocol=3, client.id=`gateway-client`, mode=`backend`)
   - **`client.id` MUST be the literal string `"gateway-client"`**. The server schema validates this field against a constant/enum — any other value (e.g. dynamic IDs like `clawwork-<uuid>`) will be rejected with `invalid connect params: at /client/id: must be equal to constant`.
2. **`chat.send` parameters**: `sessionKey` + `message` (not `text`) + `idempotencyKey` (UUID). Returns `{runId, status: "started"}`, non-blocking
3. **Chat event payload structure (major gotcha)**: Content is at `payload.message.content[]`, not `payload.content[]`. This was the root cause of messages not displaying in Phase 2
4. **Preload path**: electron-vite outputs preload as `.mjs` (not `.js`); the main process load path must match
5. **`@clawwork/shared` cannot be externalized**: Must be bundled in the electron-vite config

### Device Identity is MANDATORY for Scoped RPCs (Critical)

**The #1 gateway auth pitfall**: connecting without a `device` field in the `connect` request causes the server to **silently clear all requested scopes to `[]`**. Every scope-protected RPC (`chat.send` needs `operator.write`, `sessions.list` needs `operator.read`) then fails with `missing scope`.

Server logic (`gateway-cli-Bmg642Lj.js:22579`):
```javascript
if (!device && (!isControlUi || decision.kind !== "allow")) clearUnboundScopes();
```

When `device` is null and the client is not Control UI, scopes are wiped. Token/password auth alone is NOT enough — the server distinguishes between "authenticated" and "authorized with scopes".

**Required device auth flow:**
1. Generate Ed25519 keypair, persist to `userData/device-identity.json` (mode 0o600)
2. `deviceId` = SHA256 hex of raw 32-byte public key (strip SPKI prefix `302a300506032b6570032100`)
3. `publicKey` in connect params = raw public key bytes as base64url (no padding)
4. Build signature payload string (v3 format): `"v3|deviceId|clientId|clientMode|role|scopes|signedAtMs|token|nonce|platform|deviceFamily"` (pipe-separated, metadata ASCII-lowercased via `normalizeMetadataForAuth`)
5. Sign with Ed25519 private key, encode signature as base64url
6. `device` field in connect params: `{ id, publicKey, signature, signedAt, nonce }` where `nonce` comes from the `connect.challenge` event

**Auto-pairing**: Local backend clients (`client.id === "gateway-client"`, `mode === "backend"`, local IP, no browser origin header, shared auth OK) auto-pair without user approval.

**Device token persistence**: Server issues a `deviceToken` in the `hello-ok` response at `payload.auth.deviceToken`. Store it per-gateway in `userData/device-tokens.json` and send it back on subsequent connections via `auth.deviceToken`. This provides a secondary auth channel — if the shared gateway token changes, the device token still works (until explicitly revoked). Implementation: `device-identity.ts` has `saveDeviceToken()` / `loadDeviceToken()` / `removeDeviceToken()`.

**Server source locations** (OpenClaw 2026.3.12, for future reverse-engineering):
- `gateway-cli-Bmg642Lj.js:22222` — `shouldSkipBackendSelfPairing()`
- `gateway-cli-Bmg642Lj.js:22505-22579` — device auth validation + `clearUnboundScopes`
- `gateway-cli-Bmg642Lj.js:22883-22907` — `hello-ok` payload construction (includes `auth.deviceToken`)
- `reply-BEN3KNDZ.js:58052` — `buildDeviceAuthPayloadV3()` reference implementation
- `reply-BEN3KNDZ.js:58017-58028` — `normalizeDeviceMetadataForAuth()`

### Zustand Pitfall

**Never call `get()` inside a selector.** `useStore((s) => s.someMethod())` where `someMethod` internally calls `get()` causes infinite re-renders (new object reference each time). Fix: access state fields directly + module-level `const EMPTY_ARRAY: T[] = []` sentinel to avoid empty-array reference changes.

### `ws` Library `close()` on CONNECTING Socket

The `ws` npm package (v8.x) throws `"WebSocket was closed before the connection was established"` if you call `ws.close()` on a socket in `CONNECTING` state before the HTTP upgrade request has been created (`_req` is undefined). This happens in `GatewayClient.cleanup()` when `destroy()` is called while a connection attempt is in flight (e.g. test-gateway timeout, or rapid add/remove of gateways). **Always wrap `ws.close()` in try-catch** inside cleanup paths.

### Full Gateway Protocol Reference

Detailed protocol documentation is stored under `~/.agents/memories/**/gateway-ws-protocol.md` (path may vary by machine; generate or locate via your agent runner’s memory directory), including: frame format, connection handshake, valid client ID/mode enums, RPC method list, event types, chat message structure, available Agent list.

### Tailwind v4 `@layer` Specificity Pitfall

Tailwind v4 emits all utility classes into `@layer utilities`. Per the CSS spec, **unlayered styles always have higher specificity than any `@layer` styles** — regardless of selector specificity.

If you write unlayered global resets in `theme.css` (the file containing `@import "tailwindcss"`):

```css
/* Wrong: this overrides ALL Tailwind padding/margin utilities */
* { margin: 0; padding: 0; box-sizing: border-box; }
```

Then `pt-14`, `px-4`, `pb-3`, etc. — **all** padding/margin utilities — will be overridden to 0px, completely ineffective.

**Fix:** Remove the reset. Tailwind v4 Preflight (`@layer base`) already includes `* { margin: 0; padding: 0; box-sizing: border-box }`. If you must write custom base styles, wrap them in `@layer base { ... }`.

### Gateway Streaming Text is Cumulative Snapshots, Not Incremental Deltas

Gateway `chat` event `state: 'delta'` frames may contain **cumulative snapshots rather than incremental chunks**. The same frame may also be sent repeatedly. If `messageStore.appendStreamDelta()` directly uses `+=` to concatenate, messages will display duplicated (e.g. "HelloHelloHello...").

**Fix:** Use `mergeGatewayStreamText(previous, incoming)` for smart merging (implemented in `@clawwork/shared/constants.ts`). Merge logic:
1. `incoming === previous` → ignore duplicate frame
2. `incoming.startsWith(previous)` → cumulative snapshot, replace directly with incoming
3. `previous.startsWith(incoming)` → old snapshot replay, ignore
4. Otherwise → real incremental chunk, normal concatenation

Also, `state: 'final'` frames may carry trailing text that must be processed with `appendStreamDelta()` before `finalizeStream()`, otherwise the trailing content is lost.

### Electron Auto-Screenshot Troubleshooting

In dev mode, `main/index.ts` automatically captures a screenshot to `/tmp/clawwork-screenshot.png` after `did-finish-load`, and also supports `Cmd+Shift+S` for manual capture. When screenshots appear unchanged, don't restart repeatedly — use `executeJavaScript` to inject a diagnostic script that dumps `getComputedStyle()` to `/tmp/clawwork-debug.json` to directly verify whether CSS is taking effect.

## Known Issues & Risks

| Issue | Impact | Reference |
|---|---|---|
| Incomplete Gateway protocol docs | Must reverse-engineer from source | Refer to feishu/dingtalk plugin |
| Gateway broadcasts without session filtering | Client must filter by sessionKey | [#32579](https://github.com/openclaw/openclaw/issues/32579) |
| `mediaLocalRoots` security check | File sends may be rejected | [#20258](https://github.com/openclaw/openclaw/issues/20258), [#36477](https://github.com/openclaw/openclaw/issues/36477) |
| Session auto-reset at 4 AM | Long-running Task context gets cleared | Requires server-side config to disable auto-reset |

## Coding Conventions

- TypeScript strict mode; `any` is not allowed
- All colors via CSS Variables — no hardcoded hex values
- Component files go in `layouts/` (layout components) or `components/` (general components), organized by feature
- State management uses Zustand, one store per domain (`taskStore`, `messageStore`, `uiStore`)
- WebSocket message types are defined in `@clawwork/shared`; desktop imports from there

## Design Documents

- Full design doc: `docs/openclaw-desktop-design.md` (v0.2), covering data models, UI prototypes, ADRs, and complete descriptions + acceptance criteria for all 28 dev tasks.
- Design system spec: `design-system.md` in the repo, covering colors, fonts, spacing, border radius, shadows, animations, and component states.
