// @vitest-environment jsdom

import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Message } from '@clawwork/shared';
import '../src/renderer/i18n';
import ChatMessage from '../src/renderer/components/ChatMessage';
import StreamingMessage from '../src/renderer/components/StreamingMessage';

vi.mock('framer-motion', async () => {
  const React = await import('react');

  const motion = new Proxy({}, {
    get: (_target, tag: string) =>
      React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
        ({ children, ...props }, ref) => React.createElement(tag, { ...props, ref }, children),
      ),
  });

  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion,
  };
});

function buildMessage(partial: Partial<Message>): Message {
  return {
    id: 'msg-1',
    taskId: 'task-1',
    role: 'assistant',
    content: '',
    artifacts: [],
    toolCalls: [],
    timestamp: '2026-03-13T00:00:00.000Z',
    ...partial,
  };
}

function render(ui: ReactElement): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

const cleanups: Array<() => void> = [];

describe('chat message copy actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  afterEach(() => {
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
    vi.restoreAllMocks();
  });

  it('shows a copy button for assistant messages and copies the full message', async () => {
    const message = buildMessage({
      content: 'Alpha\n\n```ts\nconst value = 1;\n```',
    });

    const { container, unmount } = render(<ChatMessage message={message} />);
    cleanups.push(unmount);

    const button = container.querySelector('button[aria-label="Copy message"]');

    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(message.content);
  });

  it('does not show the assistant copy button for user messages', () => {
    const message = buildMessage({
      role: 'user',
      content: 'local draft',
    });

    const { container, unmount } = render(<ChatMessage message={message} />);
    cleanups.push(unmount);

    expect(container.querySelector('button[aria-label="Copy message"]')).toBeNull();
  });

  it('shows a copy button for fenced code blocks and copies only the code', async () => {
    const { container, unmount } = render(
      <StreamingMessage content={'```ts\nconst alpha = 1;\nconst beta = alpha + 1;\n```'} />,
    );
    cleanups.push(unmount);

    const button = container.querySelector('button[aria-label="Copy code"]');

    expect(button).not.toBeNull();

    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(window.navigator.clipboard.writeText).toHaveBeenCalledWith(
      'const alpha = 1;\nconst beta = alpha + 1;',
    );
  });
});
