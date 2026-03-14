import type { Message, MessageRole, ToolCall } from '@clawwork/shared';
import { useTaskStore } from '../stores/taskStore';
import { useMessageStore } from '../stores/messageStore';
import { useUiStore } from '../stores/uiStore';
import { deriveTaskRuntime, normalizeModelCatalog } from './session-runtime';

/**
 * Load tasks and their messages from local SQLite.
 * Called once on mount for instant offline render.
 */
export async function hydrateFromLocal(): Promise<void> {
  const { hydrate } = useTaskStore.getState();
  await hydrate();
  const tasks = useTaskStore.getState().tasks;
  for (const t of tasks) {
    try {
      const res = await window.clawwork.loadMessages(t.id);
      if (res.ok && res.rows && res.rows.length > 0) {
        const msgs: Message[] = res.rows.map((r) => ({
          id: r.id,
          taskId: r.taskId,
          role: r.role as MessageRole,
          content: r.content,
          artifacts: [],
          toolCalls: [],
          timestamp: r.timestamp,
        }));
        useMessageStore.getState().bulkLoad(t.id, msgs);
      }
    } catch { /* skip failed loads */ }
  }
}

/**
 * Discover sessions from all connected Gateways and adopt any that don't exist locally.
 * Called once on first Gateway connect.
 */
export async function syncFromGateway(): Promise<void> {
  try {
    const res = await window.clawwork.syncSessions();
    if (!res.ok || !res.discovered) return;
    const { adoptTasks, setTaskRuntime } = useTaskStore.getState();
    adoptTasks(res.discovered);
    for (const d of res.discovered) {
      if (d.rawSessionRow) {
        const runtime = deriveTaskRuntime(d.rawSessionRow);
        if (runtime) setTaskRuntime(d.taskId, runtime);
      }
      if (d.messages.length === 0) continue;
      const existing = useMessageStore.getState().messagesByTask[d.taskId];
      if (existing && existing.length > 0) continue;
      const msgs: Message[] = d.messages.map((m: {
        role: string;
        content: string;
        timestamp: string;
        toolCalls?: { id: string; name: string; status: string; args?: Record<string, unknown>; result?: string; startedAt: string; completedAt?: string }[];
      }) => ({
        id: crypto.randomUUID(),
        taskId: d.taskId,
        role: m.role as MessageRole,
        content: m.content,
        artifacts: [],
        toolCalls: (m.toolCalls ?? []).map((tc): ToolCall => ({
          id: tc.id,
          name: tc.name,
          status: tc.status as ToolCall['status'],
          args: tc.args,
          result: tc.result,
          startedAt: tc.startedAt,
          completedAt: tc.completedAt,
        })),
        timestamp: m.timestamp,
      }));
      useMessageStore.getState().bulkLoad(d.taskId, msgs);
      for (const msg of msgs) {
        window.clawwork.persistMessage({
          id: msg.id,
          taskId: msg.taskId,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        }).catch(() => {});
      }
    }
  } catch {
    console.warn('[sync] Gateway session sync failed');
  }
}
