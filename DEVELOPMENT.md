# Development

## Getting Started

```bash
pnpm install
pnpm --filter @clawwork/desktop dev
```

## Packaging (unsigned dmg)

```bash
pnpm --filter @clawwork/desktop run build:dmg
```

Output at `packages/desktop/dist/ClawWork-<version>-arm64.dmg`.

Unsigned — on first launch, right-click → Open.

## Debug Observability

Structured debug logging across main process, gateway WS, and renderer. All events flow into a ring buffer (1000 entries) and daily ndjson files under `.clawwork-debug/`.

- **Domains**: `app`, `gateway`, `ipc`, `renderer`, `db`, `workspace`, `artifact`, `debug`
- **Correlation**: every event supports `traceId` and `feature` fields to link a user action across IPC → gateway → renderer
- **Renderer bridge**: renderer debug events are sent to main via `debug:renderer-event` IPC channel, so the export bundle contains both sides
- **Export bundle**: `debug:export-bundle` IPC produces a timestamped directory with `recent-events.ndjson`, `timeline.json`, `gateway-status.json`, `config.sanitized.json`, `environment.json`

Trigger export from renderer:

```ts
const result = await window.clawwork.exportDebugBundle({ taskId, limit: 500 });
// result.path → absolute path to the bundle directory
```

### Troubleshooting with debug events

Debug log is at `.clawwork-debug/debug-YYYY-MM-DD.ndjson`, one JSON object per line.

**Event naming convention**: `<domain>.<noun>.<verb>` — e.g. `gateway.req.sent`, `gateway.res.received`, `ipc.ws.send-message.completed`, `renderer.chat.delta.applied`.

**Healthy message send flow** (events in order):

```
ipc.ws.send-message.requested   → user hit send
gateway.req.sent                 → WS frame dispatched (has requestId)
gateway.res.received             → server acknowledged (same requestId, ok:true)
gateway.event.received           → streaming events arrive (event:"chat")
renderer.chat.delta.applied      → UI appended text
renderer.chat.finalized          → stream complete
```

**Healthy connection flow**:

```
gateway.connect.start            → WS connecting
gateway.ws.open                  → TCP established
gateway.challenge.received       → auth challenge from server
gateway.connect.res.ok           → authenticated, ready
gateway.heartbeat.start          → keepalive active
```

**How to trace a single user action**: filter by `traceId` (when set) or by `requestId` + `sessionKey` to follow one request across layers.

**Common failure patterns**:

| Symptom | What to look for |
|---------|-----------------|
| Message sent, no response | `gateway.req.sent` present but no matching `gateway.res.received` → check `gateway.req.timeout` |
| Message sent, response OK but nothing in UI | `gateway.res.received` ok:true but no `renderer.chat.delta.applied` → event routing issue, check `renderer.event.dropped.*` |
| Connection drops | `gateway.ws.close` with code/reason, then `gateway.reconnect.scheduled` or `gateway.reconnect.giveup` |
| Auth failure | `gateway.challenge.received` followed by `gateway.challenge.invalid` instead of `gateway.connect.res.ok` |
| IPC call fails silently | `ipc.ws.send-message.requested` present but no `.completed` → check `ipc.ws.send-message.failed` for error |
