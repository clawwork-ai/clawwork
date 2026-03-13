import { create } from 'zustand';
import { mergeGatewayStreamText } from '@clawwork/shared';
import type { Message, MessageRole, MessageImageAttachment } from '@clawwork/shared';

/** Stable empty array — avoids creating new references on every selector call */
const EMPTY_MESSAGES: Message[] = [];

interface MessageState {
  /** taskId → messages */
  messagesByTask: Record<string, Message[]>;
  /** taskId → currently streaming assistant content (delta accumulator) */
  streamingByTask: Record<string, string>;
  /** Set of taskIds currently waiting for Agent response */
  processingTasks: Set<string>;
  /** message ID to highlight (e.g. from file navigation) */
  highlightedMessageId: string | null;

  addMessage: (taskId: string, role: MessageRole, content: string, imageAttachments?: MessageImageAttachment[]) => Message;
  /** Bulk-load messages into store without persisting to DB */
  bulkLoad: (taskId: string, msgs: Message[]) => void;
  appendStreamDelta: (taskId: string, delta: string) => void;
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

  finalizeStream: (taskId) => {
    let captured: Message | null = null;
    set((s) => {
      const content = s.streamingByTask[taskId];
      if (!content) return s;
      const msg: Message = {
        id: generateId(),
        taskId,
        role: 'assistant',
        content,
        artifacts: [],
        toolCalls: [],
        timestamp: new Date().toISOString(),
      };
      captured = msg;
      const nextStreaming = { ...s.streamingByTask };
      delete nextStreaming[taskId];
      return {
        messagesByTask: {
          ...s.messagesByTask,
          [taskId]: [...(s.messagesByTask[taskId] ?? []), msg],
        },
        streamingByTask: nextStreaming,
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
