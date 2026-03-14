import { useEffect, useRef } from 'react';
import { parseTaskIdFromSessionKey } from '@clawwork/shared';
import type { ToolCall, ToolCallStatus, ModelListResponse, AgentListResponse } from '@clawwork/shared';
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
  // toolCall content blocks from Gateway
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
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

interface AgentToolData {
  phase?: string;        // "update" = running, "result" = done, "error" = error
  name?: string;         // tool name, e.g. "exec"
  toolCallId?: string;   // e.g. "call_9GV1FoNq..."
  meta?: string;         // result description (present on "result" phase)
  isError?: boolean;     // true if tool errored
  args?: string;         // tool arguments (sometimes present)
}

interface AgentToolEvent {
  sessionKey: string;
  runId?: string;
  stream?: string;
  seq?: number;
  ts?: number;
  data?: AgentToolData;
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
    const handler = (data: { event: string; payload: Record<string, unknown>; gatewayId: string }): void => {
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
      const thinking = extractThinking(payload);

      if (state === 'delta') {
        if (text) {
          store.setProcessing(taskId, false);
          store.appendStreamDelta(taskId, text);
        }
        if (thinking) {
          store.appendThinkingDelta(taskId, thinking);
        }
        // Also process toolCall blocks from delta content
        const toolCalls = extractToolCalls(payload);
        for (const tc of toolCalls) {
          store.upsertToolCall(taskId, tc);
        }
      } else if (state === 'final') {
        store.setProcessing(taskId, false);
        if (text) {
          store.appendStreamDelta(taskId, text);
        }
        if (thinking) {
          store.appendThinkingDelta(taskId, thinking);
        }
        // Extract and attach any toolCall blocks before finalizing
        const toolCalls = extractToolCalls(payload);
        for (const tc of toolCalls) {
          store.upsertToolCall(taskId, tc);
        }
        store.finalizeStream(taskId);
        autoTitleIfNeeded(taskId);
        // Refresh session metadata to pick up token counts
        refreshSessionMetadata(sessionKey);
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
      const { sessionKey, stream, data } = payload;
      if (stream !== 'tool' || !data || !sessionKey) return;

      const taskId = parseTaskIdFromSessionKey(sessionKey);
      if (!taskId) return;

      if (!data.name || !data.toolCallId) return;

      if (taskId !== activeTaskIdRef.current) {
        useUiStore.getState().markUnread(taskId);
      }

      // Map Gateway phase to our ToolCallStatus
      let status: ToolCallStatus = 'running';
      if (data.phase === 'result') status = data.isError ? 'error' : 'done';
      else if (data.phase === 'error') status = 'error';

      const tc: ToolCall = {
        id: data.toolCallId,
        name: data.name,
        status,
        args: parseToolArgs(data.args),
        result: data.meta,
        startedAt: data.phase === 'update' ? new Date().toISOString() : '',
        completedAt: status !== 'running' ? new Date().toISOString() : undefined,
      };

      const store = useMessageStore.getState();
      // Preserve startedAt from existing entry if we're updating
      const existingMsgs = store.messagesByTask[taskId] ?? [];
      for (let i = existingMsgs.length - 1; i >= 0; i--) {
        const existing = existingMsgs[i].toolCalls.find((t) => t.id === tc.id);
        if (existing) {
          tc.startedAt = existing.startedAt;
          break;
        }
      }
      if (!tc.startedAt) tc.startedAt = new Date().toISOString();

      store.upsertToolCall(taskId, tc);
    }

    const removeGatewayEvent = window.clawwork.onGatewayEvent(handler);
    return removeGatewayEvent;
  }, []);

  // Hydrate tasks + messages from local SQLite on mount
  useEffect(() => {
    hydrateFromLocal();
  }, []);

  const connectedGatewaysRef = useRef<Set<string>>(new Set());
  const syncedRef = useRef(false);
  useEffect(() => {
    const { setGatewayStatusByGateway, setDefaultGatewayId } = useUiStore.getState();

    // Fetch initial status for all gateways
    window.clawwork.gatewayStatus().then((statusMap) => {
      for (const [gwId, info] of Object.entries(statusMap)) {
        const status = info.connected ? 'connected' as const : 'disconnected' as const;
        setGatewayStatusByGateway(gwId, status);
        if (info.connected) {
          connectedGatewaysRef.current.add(gwId);
        }
      }
      // If any gateway connected and not yet synced, sync
      if (connectedGatewaysRef.current.size > 0 && !syncedRef.current) {
        syncedRef.current = true;
        syncFromGateway();
        // Fetch catalogs from the first connected gateway
        const firstConnected = connectedGatewaysRef.current.values().next().value;
        if (firstConnected) fetchCatalogs(firstConnected);
      }
    });

    // Set default gateway and cache gateway info from config
    window.clawwork.listGateways().then((gateways) => {
      const defaultGw = gateways.find((g) => g.isDefault);
      if (defaultGw) {
        setDefaultGatewayId(defaultGw.id);
      } else if (gateways.length > 0) {
        setDefaultGatewayId(gateways[0].id);
      }
      // Cache gateway info for display (TaskItem badges, selectors)
      const infoMap: Record<string, { id: string; name: string; color?: string }> = {};
      for (const gw of gateways) {
        infoMap[gw.id] = { id: gw.id, name: gw.name, color: gw.color };
      }
      useUiStore.getState().setGatewayInfoMap(infoMap);
    });

    const removeGatewayStatus = window.clawwork.onGatewayStatus((s) => {
      const wasConnected = connectedGatewaysRef.current.has(s.gatewayId);
      const next = s.connected ? 'connected' as const : s.error ? 'disconnected' as const : 'connecting' as const;
      setGatewayStatusByGateway(s.gatewayId, next);

      if (s.connected && !wasConnected) {
        connectedGatewaysRef.current.add(s.gatewayId);
        toast.success(i18n.t('connection.reconnected'));
        if (!syncedRef.current) {
          syncedRef.current = true;
          syncFromGateway();
        }
        fetchCatalogs(s.gatewayId);
      } else if (!s.connected && wasConnected) {
        connectedGatewaysRef.current.delete(s.gatewayId);
        toast.warning(i18n.t('connection.lostConnection'), { description: i18n.t('connection.reconnecting') });
      }
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

function extractThinking(payload: ChatEventPayload): string {
  const blocks = payload.message?.content ?? payload.content;
  if (!blocks) return '';
  return blocks
    .filter((b) => b.type === 'thinking' && b.thinking)
    .map((b) => b.thinking!)
    .join('');
}

/** Extract toolCall blocks from a chat event's content array into ToolCall objects */
function extractToolCalls(payload: ChatEventPayload): ToolCall[] {
  const blocks = payload.message?.content ?? payload.content;
  if (!blocks) return [];
  const result: ToolCall[] = [];
  for (const b of blocks) {
    if (b.type === 'toolCall' && b.id && b.name) {
      result.push({
        id: b.id,
        name: b.name,
        status: 'running',
        args: typeof b.arguments === 'object' ? b.arguments as Record<string, unknown> : parseToolArgs(typeof b.arguments === 'string' ? b.arguments : undefined),
        startedAt: new Date().toISOString(),
      });
    }
  }
  return result;
}

function parseToolArgs(raw: string | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
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

async function fetchCatalogs(gatewayId: string): Promise<void> {
  const { setModelCatalog, setAgentCatalog } = useUiStore.getState();
  try {
    const [modelsRes, agentsRes] = await Promise.all([
      window.clawwork.listModels(gatewayId),
      window.clawwork.listAgents(gatewayId),
    ]);
    if (modelsRes.ok && modelsRes.result) {
      const data = modelsRes.result as unknown as ModelListResponse;
      if (data.models) setModelCatalog(data.models);
    }
    if (agentsRes.ok && agentsRes.result) {
      const data = agentsRes.result as unknown as AgentListResponse;
      if (data.agents) setAgentCatalog(data.agents, data.defaultId);
    }
  } catch {
    console.warn('[catalogs] Failed to fetch model/agent catalogs');
  }
}

function refreshSessionMetadata(sessionKey: string): void {
  // Re-sync session metadata from gateway to pick up updated token counts
  // Use a small delay to let the server finish writing the session store
  setTimeout(() => {
    syncFromGateway().catch(() => {});
  }, 500);
}
