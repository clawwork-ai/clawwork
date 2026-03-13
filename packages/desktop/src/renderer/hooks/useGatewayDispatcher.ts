import { useEffect, useRef } from 'react';
import { parseTaskIdFromSessionKey } from '@clawwork/shared';
import { toast } from 'sonner';
import i18n from '../i18n';
import { useMessageStore } from '../stores/messageStore';
import { useTaskStore } from '../stores/taskStore';
import { useUiStore } from '../stores/uiStore';
import { hydrateFromLocal, syncFromGateway } from '../lib/session-sync';

interface ChatContentBlock {
  type: string;
  text?: string;
  thinking?: string;
}

interface ChatMessage {
  role?: string;
  content?: ChatContentBlock[];
}

interface ChatEventPayload {
  sessionKey: string;
  runId?: string;
  state?: 'delta' | 'final' | 'aborted' | 'error';
  message?: ChatMessage;
  content?: ChatContentBlock[];
  text?: string;
}

interface AgentToolEvent {
  sessionKey: string;
  runId?: string;
  stream?: string;
  tool?: {
    name: string;
    status: 'running' | 'done' | 'error';
    args?: string;
    result?: string;
  };
}

/**
 * Subscribes to Gateway events and dispatches into Zustand stores.
 * Mount once at App root level.
 */
export function useGatewayEventDispatcher(): void {
  const activeTaskId = useTaskStore((s) => s.activeTaskId);
  const activeTaskIdRef = useRef(activeTaskId);
  activeTaskIdRef.current = activeTaskId;

  useEffect(() => {
    const handler = (data: { event: string; payload: Record<string, unknown> }): void => {
      if (data.event === 'chat') {
        handleChatEvent(data.payload as unknown as ChatEventPayload);
      } else if (data.event === 'agent') {
        handleAgentEvent(data.payload as unknown as AgentToolEvent);
      }
    };

    function handleChatEvent(payload: ChatEventPayload): void {
      const { sessionKey, state } = payload;
      if (!sessionKey) return;

      const taskId = parseTaskIdFromSessionKey(sessionKey);
      if (!taskId) return;

      if (taskId !== activeTaskIdRef.current) {
        useUiStore.getState().markUnread(taskId);
      }

      const store = useMessageStore.getState();
      const text = extractText(payload);

      if (state === 'delta') {
        if (text) {
          store.setProcessing(taskId, false);
          store.appendStreamDelta(taskId, text);
        }
      } else if (state === 'final') {
        store.setProcessing(taskId, false);
        if (text) {
          store.appendStreamDelta(taskId, text);
        }
        store.finalizeStream(taskId);
        autoTitleIfNeeded(taskId);
      } else if (state === 'error' || state === 'aborted') {
        store.setProcessing(taskId, false);
        store.finalizeStream(taskId);
        if (state === 'error') {
          const errText = extractText(payload) || i18n.t('errors.requestFailed');
          store.addMessage(taskId, 'system', errText);
        }
      }
    }

    function handleAgentEvent(payload: AgentToolEvent): void {
      const { sessionKey, stream, tool } = payload;
      if (stream !== 'tool' || !tool || !sessionKey) return;

      const taskId = parseTaskIdFromSessionKey(sessionKey);
      if (!taskId) return;

      if (taskId !== activeTaskIdRef.current) {
        useUiStore.getState().markUnread(taskId);
      }

      const toolText = formatToolEvent(tool);
      useMessageStore.getState().addMessage(taskId, 'system', toolText);
    }

    const removeGatewayEvent = window.clawwork.onGatewayEvent(handler);
    return removeGatewayEvent;
  }, []);

  // Hydrate tasks + messages from local SQLite on mount
  useEffect(() => {
    hydrateFromLocal();
  }, []);

  const wasConnectedRef = useRef(true);
  const syncedRef = useRef(false);
  useEffect(() => {
    const setGwStatus = useUiStore.getState().setGatewayStatus;
    window.clawwork.gatewayStatus().then((s) => {
      const status = s.connected ? 'connected' as const : 'disconnected' as const;
      setGwStatus(status);
      wasConnectedRef.current = s.connected;
      if (s.connected && !syncedRef.current) {
        syncedRef.current = true;
        syncFromGateway();
      }
    });
    const removeGatewayStatus = window.clawwork.onGatewayStatus((s) => {
      const next = s.connected ? 'connected' as const : s.error ? 'disconnected' as const : 'connecting' as const;
      setGwStatus(next);
      if (s.connected && !wasConnectedRef.current) {
        toast.success('Gateway reconnected');
        if (!syncedRef.current) {
          syncedRef.current = true;
          syncFromGateway();
        }
      } else if (!s.connected && wasConnectedRef.current) {
        toast.warning('Gateway disconnected', { description: 'Attempting to reconnect...' });
      }
      wasConnectedRef.current = s.connected;
    });
    return removeGatewayStatus;
  }, []);
}

function extractText(payload: ChatEventPayload): string {
  const blocks = payload.message?.content ?? payload.content;
  if (blocks) {
    return blocks
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text!)
      .join('');
  }
  return payload.text ?? '';
}

function formatToolEvent(tool: { name: string; status: string; args?: string; result?: string }): string {
  const prefix = tool.status === 'running' ? '🔧' : tool.status === 'done' ? '✅' : '❌';
  return `${prefix} \`${tool.name}\` — ${tool.status}`;
}

function autoTitleIfNeeded(taskId: string): void {
  const { tasks, updateTaskTitle } = useTaskStore.getState();
  const task = tasks.find((t) => t.id === taskId);
  if (task && !task.title) {
    const msgs = useMessageStore.getState().messagesByTask[taskId] ?? [];
    const firstAssistant = msgs.find((m) => m.role === 'assistant');
    if (firstAssistant) {
      const title = firstAssistant.content.slice(0, 30).replace(/\n/g, ' ').trim();
      if (title) {
        updateTaskTitle(taskId, title + (firstAssistant.content.length > 30 ? '…' : ''));
      }
    }
  }
}

