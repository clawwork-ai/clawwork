import { create } from 'zustand';
import { mergeGatewayStreamText } from '@clawwork/shared';
import type { Message, MessageRole, MessageImageAttachment, ToolCall } from '@clawwork/shared';

/** Stable empty array — avoids creating new references on every selector call */
const EMPTY_MESSAGES: Message[] = [];

interface MessageState {
  /** taskId → messages */
  messagesByTask: Record<string, Message[]>;
  /** taskId → currently streaming assistant content (delta accumulator) */
  streamingByTask: Record<string, string>;
  /** taskId → currently streaming thinking content */
  streamingThinkingByTask: Record<string, string>;
  /** Set of taskIds currently waiting for Agent response */
  processingTasks: Set<string>;
  /** message ID to highlight (e.g. from file navigation) */
  highlightedMessageId: string | null;

  addMessage: (taskId: string, role: MessageRole, content: string, imageAttachments?: MessageImageAttachment[]) => Message;
  /** Insert or update a ToolCall on the latest assistant message for a task.
   *  If no assistant message exists yet, one is created to host the tool call. */
  upsertToolCall: (taskId: string, tc: ToolCall) => void;
  /** Bulk-load messages into store without persisting to DB */
  bulkLoad: (taskId: string, msgs: Message[]) => void;
  appendStreamDelta: (taskId: string, delta: string) => void;
  appendThinkingDelta: (taskId: string, delta: string) => void;
  finalizeStream: (taskId: string) => void;
  clearMessages: (taskId: string) => void;
  setHighlightedMessage: (id: string | null) => void;
  setProcessing: (taskId: string, processing: boolean) => void;
}

export { EMPTY_MESSAGES };

function generateId(): string {
  return crypto.randomUUID();
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messagesByTask: {},
  streamingByTask: {},
  streamingThinkingByTask: {},
  processingTasks: new Set(),
  highlightedMessageId: null,

  addMessage: (taskId, role, content, imageAttachments?) => {
    const msg: Message = {
      id: generateId(),
      taskId,
      role,
      content,
      artifacts: [],
      toolCalls: [],
      imageAttachments: imageAttachments?.length ? imageAttachments : undefined,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({
      messagesByTask: {
        ...s.messagesByTask,
        [taskId]: [...(s.messagesByTask[taskId] ?? []), msg],
      },
    }));
    window.clawwork.persistMessage({
      id: msg.id,
      taskId: msg.taskId,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
    }).catch(() => {});
    return msg;
  },

  upsertToolCall: (taskId, tc) =>
    set((s) => {
      const msgs = s.messagesByTask[taskId] ?? [];
      // Find the last assistant message to attach the tool call to
      let targetIdx = -1;
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant') { targetIdx = i; break; }
      }

      const updatedMsgs = [...msgs];
      if (targetIdx >= 0) {
        const target = updatedMsgs[targetIdx];
        const existingIdx = target.toolCalls.findIndex((t) => t.id === tc.id);
        const nextToolCalls = [...target.toolCalls];
        if (existingIdx >= 0) {
          nextToolCalls[existingIdx] = tc;
        } else {
          nextToolCalls.push(tc);
        }
        updatedMsgs[targetIdx] = { ...target, toolCalls: nextToolCalls };
      } else {
        // No assistant message yet — create a placeholder to host tool calls
        updatedMsgs.push({
          id: generateId(),
          taskId,
          role: 'assistant',
          content: '',
          artifacts: [],
          toolCalls: [tc],
          timestamp: new Date().toISOString(),
        });
      }
      return {
        messagesByTask: { ...s.messagesByTask, [taskId]: updatedMsgs },
      };
    }),

  bulkLoad: (taskId, msgs) =>
    set((s) => ({
      messagesByTask: {
        ...s.messagesByTask,
        [taskId]: msgs,
      },
    })),

  appendStreamDelta: (taskId, delta) =>
    set((s) => ({
      streamingByTask: {
        ...s.streamingByTask,
        [taskId]: mergeGatewayStreamText(s.streamingByTask[taskId] ?? '', delta),
      },
    })),

  appendThinkingDelta: (taskId, delta) =>
    set((s) => ({
      streamingThinkingByTask: {
        ...s.streamingThinkingByTask,
        [taskId]: mergeGatewayStreamText(s.streamingThinkingByTask[taskId] ?? '', delta),
      },
    })),

  finalizeStream: (taskId) => {
    let captured: Message | null = null;
    set((s) => {
      const content = s.streamingByTask[taskId];
      if (!content) return s;
      const thinkingContent = s.streamingThinkingByTask[taskId] || undefined;
      const msg: Message = {
        id: generateId(),
        taskId,
        role: 'assistant',
        content,
        thinkingContent,
        artifacts: [],
        toolCalls: [],
        timestamp: new Date().toISOString(),
      };
      captured = msg;
      const nextStreaming = { ...s.streamingByTask };
      delete nextStreaming[taskId];
      const nextThinking = { ...s.streamingThinkingByTask };
      delete nextThinking[taskId];
      return {
        messagesByTask: {
          ...s.messagesByTask,
          [taskId]: [...(s.messagesByTask[taskId] ?? []), msg],
        },
        streamingByTask: nextStreaming,
        streamingThinkingByTask: nextThinking,
      };
    });
    if (captured) {
      const msg = captured as Message;
      window.clawwork.persistMessage({
        id: msg.id,
        taskId: msg.taskId,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
      }).catch(() => {});
    }
  },

  clearMessages: (taskId) =>
    set((s) => {
      const next = { ...s.messagesByTask };
      delete next[taskId];
      return { messagesByTask: next };
    }),

  setHighlightedMessage: (id) => set({ highlightedMessageId: id }),

  setProcessing: (taskId, processing) =>
    set((s) => {
      const next = new Set(s.processingTasks);
      if (processing) next.add(taskId);
      else next.delete(taskId);
      return { processingTasks: next };
    }),
}));
