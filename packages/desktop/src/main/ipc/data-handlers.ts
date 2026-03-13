import { ipcMain } from 'electron';
import { eq, desc } from 'drizzle-orm';
import { getDb, isDbReady } from '../db/index.js';
import { tasks, messages } from '../db/schema.js';

interface CreateTaskParams {
  id: string;
  sessionKey: string;
  sessionId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  artifactDir: string;
  gatewayId: string;
}

interface UpdateTaskParams {
  id: string;
  title?: string;
  status?: string;
  updatedAt: string;
}

interface CreateMessageParams {
  id: string;
  taskId: string;
  role: string;
  content: string;
  timestamp: string;
}

function ipcError(err: unknown): { ok: false; error: string } {
  return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
}

export function registerDataHandlers(): void {
  ipcMain.handle('data:create-task', (_event, task: CreateTaskParams) => {
    if (!isDbReady()) return ipcError(new Error('database not ready'));
    try {
      const db = getDb();
      db.insert(tasks).values({
        id: task.id,
        sessionKey: task.sessionKey,
        sessionId: task.sessionId,
        title: task.title,
        status: task.status,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        tags: JSON.stringify(task.tags),
        artifactDir: task.artifactDir,
        gatewayId: task.gatewayId,
      }).run();
      return { ok: true };
    } catch (err) {
      console.error('[data] create-task failed:', err);
      return ipcError(err);
    }
  });

  ipcMain.handle('data:update-task', (_event, params: UpdateTaskParams) => {
    if (!isDbReady()) return ipcError(new Error('database not ready'));
    try {
      const db = getDb();
      const updates: Record<string, string> = { updatedAt: params.updatedAt };
      if (params.title !== undefined) updates.title = params.title;
      if (params.status !== undefined) updates.status = params.status;
      db.update(tasks).set(updates).where(eq(tasks.id, params.id)).run();
      return { ok: true };
    } catch (err) {
      console.error('[data] update-task failed:', err);
      return ipcError(err);
    }
  });

  ipcMain.handle('data:create-message', (_event, msg: CreateMessageParams) => {
    if (!isDbReady()) return ipcError(new Error('database not ready'));
    try {
      const db = getDb();
      db.insert(messages).values({
        id: msg.id,
        taskId: msg.taskId,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }).run();
      return { ok: true };
    } catch (err) {
      console.error('[data] create-message failed:', err);
      return ipcError(err);
    }
  });

  ipcMain.handle('data:list-tasks', () => {
    if (!isDbReady()) return { ok: true, rows: [] };
    try {
      const db = getDb();
      const rows = db.select().from(tasks).orderBy(desc(tasks.createdAt)).all();
      return { ok: true, rows: rows.map((r) => ({ ...r, tags: JSON.parse(r.tags as string) })) };
    } catch (err) {
      console.error('[data] list-tasks failed:', err);
      return ipcError(err);
    }
  });

  ipcMain.handle('data:list-messages', (_event, params: { taskId: string }) => {
    if (!isDbReady()) return { ok: true, rows: [] };
    try {
      const db = getDb();
      const rows = db.select().from(messages)
        .where(eq(messages.taskId, params.taskId))
        .orderBy(messages.timestamp)
        .all();
      return { ok: true, rows };
    } catch (err) {
      console.error('[data] list-messages failed:', err);
      return ipcError(err);
    }
  });
}
