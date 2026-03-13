import { ipcMain } from 'electron';
import { getGatewayClient } from '../ws/index.js';
import { isClawWorkSession, parseTaskIdFromSessionKey } from '@clawwork/shared';
import type { ChatAttachment } from '@clawwork/shared';

interface GatewaySessionRow {
  key: string;
  sessionId?: string;
  updatedAt: number | null;
  derivedTitle?: string;
  label?: string;
  displayName?: string;
}

interface SessionsListPayload {
  sessions?: GatewaySessionRow[];
}

interface ChatHistoryMessage {
  role: string;
  content: { type: string; text?: string; thinking?: string }[];
  timestamp?: number;
}

interface ChatHistoryPayload {
  messages?: ChatHistoryMessage[];
  sessionId?: string;
}

export function registerWsHandlers(): void {
  ipcMain.handle('ws:send-message', async (_event, payload: {
    sessionKey: string;
    content: string;
    attachments?: ChatAttachment[];
  }) => {
    const gw = getGatewayClient();
    if (!gw?.isConnected) {
      return { ok: false, error: 'gateway not connected' };
    }
    try {
      await gw.sendChatMessage(payload.sessionKey, payload.content, payload.attachments);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('ws:chat-history', async (_event, payload: {
    sessionKey: string;
    limit?: number;
  }) => {
    const gw = getGatewayClient();
    if (!gw?.isConnected) {
      return { ok: false, error: 'gateway not connected' };
    }
    try {
      const result = await gw.getChatHistory(payload.sessionKey, payload.limit);
      return { ok: true, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('ws:list-sessions', async () => {
    const gw = getGatewayClient();
    if (!gw?.isConnected) {
      return { ok: false, error: 'gateway not connected' };
    }
    try {
      const result = await gw.listSessions();
      return { ok: true, result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('ws:gateway-status', () => {
    const gw = getGatewayClient();
    return { connected: gw?.isConnected ?? false };
  });

  ipcMain.handle('ws:sync-sessions', async () => {
    const gw = getGatewayClient();
    if (!gw?.isConnected) {
      return { ok: false, error: 'gateway not connected' };
    }
    try {
      const raw = await gw.listSessions() as unknown as SessionsListPayload;
      const allSessions = raw.sessions ?? [];
      const ours = allSessions.filter((s) => isClawWorkSession(s.key));

      const discovered: {
        taskId: string;
        sessionKey: string;
        title: string;
        updatedAt: string;
        messages: { role: string; content: string; timestamp: string }[];
      }[] = [];

      for (const s of ours) {
        const taskId = parseTaskIdFromSessionKey(s.key);
        if (!taskId) continue;

        const historyRaw = await gw.getChatHistory(s.key, 200) as unknown as ChatHistoryPayload;
        const msgs = (historyRaw.messages ?? []).map((m) => ({
          role: m.role,
          content: (m.content ?? [])
            .filter((b) => b.type === 'text' && b.text)
            .map((b) => b.text!)
            .join(''),
          timestamp: m.timestamp
            ? new Date(m.timestamp).toISOString()
            : new Date().toISOString(),
        })).filter((m) => m.content);

        discovered.push({
          taskId,
          sessionKey: s.key,
          title: s.derivedTitle ?? s.label ?? s.displayName ?? '',
          updatedAt: s.updatedAt
            ? new Date(s.updatedAt).toISOString()
            : new Date().toISOString(),
          messages: msgs,
        });
      }

      return { ok: true, discovered };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      console.error('[ws] sync-sessions failed:', msg);
      return { ok: false, error: msg };
    }
  });
}
