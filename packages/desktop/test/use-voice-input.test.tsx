// @vitest-environment jsdom

import { act, type ReactElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceInput, type VoicePermissionStatus } from '../src/renderer/hooks/useVoiceInput';

interface FakeSession {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  emitInterim: (text: string) => void;
  emitFinal: (text: string) => void;
  emitError: (code: string) => void;
  emitEnd: () => void;
}

function createFakeSessionFactory(): {
  createSession: ReturnType<typeof vi.fn>;
  getLastSession: () => FakeSession | null;
} {
  let lastSession: FakeSession | null = null;

  const createSession = vi.fn((handlers: {
    onInterimResult: (text: string) => void;
    onFinalResult: (text: string) => void;
    onError: (code: string) => void;
    onEnd: () => void;
  }) => {
    lastSession = {
      start: vi.fn(),
      stop: vi.fn(),
      destroy: vi.fn(),
      emitInterim: (text: string) => handlers.onInterimResult(text),
      emitFinal: (text: string) => handlers.onFinalResult(text),
      emitError: (code: string) => handlers.onError(code),
      emitEnd: () => handlers.onEnd(),
    };

    return lastSession;
  });

  return {
    createSession,
    getLastSession: () => lastSession,
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

interface HarnessProps {
  hasActiveTask?: boolean;
  mainView?: 'chat' | 'files' | 'archived';
  settingsOpen?: boolean;
  isSupported?: boolean;
  initialValue?: string;
  loadIntroSeen?: () => Promise<boolean>;
  markIntroSeen?: () => Promise<void>;
  requestPermission?: () => Promise<VoicePermissionStatus>;
  createSession?: ReturnType<typeof vi.fn>;
}

function Harness({
  hasActiveTask = true,
  mainView = 'chat',
  settingsOpen = false,
  isSupported = true,
  initialValue = '',
  loadIntroSeen = async () => true,
  markIntroSeen = async () => {},
  requestPermission = async () => 'granted',
  createSession,
}: HarnessProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceInput({
    textareaRef,
    hasActiveTask,
    mainView,
    settingsOpen,
    loadIntroSeen,
    markIntroSeen,
    requestPermission,
    createSession: createSession ?? (() => null),
    pressHoldDelayMs: 220,
    isSupported,
  });

  return (
    <>
      <textarea
        ref={textareaRef}
        defaultValue={initialValue}
        onKeyDown={voice.handleKeyDown}
        onKeyUp={voice.handleKeyUp}
      />
      <button type="button" data-testid="confirm-intro" onClick={() => void voice.confirmIntro()}>
        confirm
      </button>
      <button type="button" data-testid="start-trigger" onClick={() => void voice.startFromTrigger()}>
        start
      </button>
      <div data-testid="intro-state">{voice.isIntroOpen ? 'open' : 'closed'}</div>
      <div data-testid="listening-state">{voice.isListening ? 'listening' : 'idle'}</div>
      <div data-testid="interim">{voice.interimTranscript}</div>
      <div data-testid="error">{voice.errorCode ?? ''}</div>
    </>
  );
}

async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useVoiceInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('treats a short space press as normal whitespace', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const);
    const sessionFactory = createFakeSessionFactory();
    const { container, unmount } = render(
      <Harness
        initialValue="hello"
        loadIntroSeen={async () => true}
        requestPermission={requestPermission}
        createSession={sessionFactory.createSession}
      />,
    );

    await flushAsync();

    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    textarea!.focus();
    textarea!.setSelectionRange(5, 5);

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });

    expect(textarea!.value).toBe('hello ');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sessionFactory.createSession).not.toHaveBeenCalled();

    unmount();
  });

  it('swallows repeated keydown events during a held space press', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const);
    const sessionFactory = createFakeSessionFactory();
    const { container, unmount } = render(
      <Harness
        initialValue=""
        loadIntroSeen={async () => true}
        requestPermission={requestPermission}
        createSession={sessionFactory.createSession}
      />,
    );

    await flushAsync();

    const textarea = container.querySelector('textarea');
    textarea!.focus();
    textarea!.setSelectionRange(0, 0);

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true }));
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true }));
      vi.advanceTimersByTime(100);
      textarea!.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });

    expect(textarea!.value).toBe(' ');
    expect(requestPermission).not.toHaveBeenCalled();

    unmount();
  });

  it('opens the intro dialog on the first long press without starting recognition', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const);
    const sessionFactory = createFakeSessionFactory();
    const { container, unmount } = render(
      <Harness
        loadIntroSeen={async () => false}
        requestPermission={requestPermission}
        createSession={sessionFactory.createSession}
      />,
    );

    await flushAsync();

    const textarea = container.querySelector('textarea');
    const introState = container.querySelector('[data-testid="intro-state"]');

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      vi.advanceTimersByTime(220);
    });

    await flushAsync();

    expect(introState?.textContent).toBe('open');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sessionFactory.createSession).not.toHaveBeenCalled();

    unmount();
  });

  it('starts recognition after intro confirmation and inserts transcripts correctly', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const);
    const markIntroSeen = vi.fn(async () => {});
    const sessionFactory = createFakeSessionFactory();
    const { container, unmount } = render(
      <Harness
        initialValue="alpha"
        loadIntroSeen={async () => false}
        markIntroSeen={markIntroSeen}
        requestPermission={requestPermission}
        createSession={sessionFactory.createSession}
      />,
    );

    await flushAsync();

    const textarea = container.querySelector('textarea');
    const confirmButton = container.querySelector('[data-testid="confirm-intro"]');
    const introState = container.querySelector('[data-testid="intro-state"]');
    const listeningState = container.querySelector('[data-testid="listening-state"]');
    const interim = container.querySelector('[data-testid="interim"]');

    textarea!.focus();
    textarea!.setSelectionRange(5, 5);

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      vi.advanceTimersByTime(220);
    });

    expect(introState?.textContent).toBe('open');

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });

    await act(async () => {
      confirmButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(markIntroSeen).toHaveBeenCalledTimes(1);

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      vi.advanceTimersByTime(220);
    });

    await flushAsync();

    const session = sessionFactory.getLastSession();

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(sessionFactory.createSession).toHaveBeenCalledTimes(1);
    expect(session?.start).toHaveBeenCalledTimes(1);
    expect(listeningState?.textContent).toBe('listening');

    act(() => {
      session?.emitInterim('beta');
    });

    expect(interim?.textContent).toBe('beta');
    expect(textarea!.value).toBe('alpha');

    act(() => {
      session?.emitFinal('gamma');
    });

    expect(textarea!.value).toBe('alpha gamma');

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    });

    expect(session?.stop).toHaveBeenCalledTimes(1);

    unmount();
  });

  it('reports permission denial and does not start recognition', async () => {
    const requestPermission = vi.fn(async () => 'denied' as const);
    const sessionFactory = createFakeSessionFactory();
    const { container, unmount } = render(
      <Harness
        loadIntroSeen={async () => true}
        requestPermission={requestPermission}
        createSession={sessionFactory.createSession}
      />,
    );

    await flushAsync();

    const textarea = container.querySelector('textarea');
    const error = container.querySelector('[data-testid="error"]');
    const listeningState = container.querySelector('[data-testid="listening-state"]');

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      vi.advanceTimersByTime(220);
    });

    await flushAsync();

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(sessionFactory.createSession).not.toHaveBeenCalled();
    expect(error?.textContent).toBe('permission-denied');
    expect(listeningState?.textContent).toBe('idle');

    unmount();
  });

  it('stops and destroys the active session on unmount', async () => {
    const sessionFactory = createFakeSessionFactory();
    const { container, unmount } = render(
      <Harness
        loadIntroSeen={async () => true}
        requestPermission={async () => 'granted'}
        createSession={sessionFactory.createSession}
      />,
    );

    await flushAsync();

    const textarea = container.querySelector('textarea');

    act(() => {
      textarea!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      vi.advanceTimersByTime(220);
    });

    await flushAsync();

    const session = sessionFactory.getLastSession();
    expect(session?.start).toHaveBeenCalledTimes(1);

    unmount();

    expect(session?.stop).not.toHaveBeenCalled();
    expect(session?.destroy).toHaveBeenCalledTimes(1);
  });

  it('reports unsupported when trigger start is requested in an unsupported runtime', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const);
    const sessionFactory = createFakeSessionFactory();
    const { container, unmount } = render(
      <Harness
        isSupported={false}
        loadIntroSeen={async () => true}
        requestPermission={requestPermission}
        createSession={sessionFactory.createSession}
      />,
    );

    await flushAsync();

    const startButton = container.querySelector('[data-testid="start-trigger"]');
    const error = container.querySelector('[data-testid="error"]');

    await act(async () => {
      startButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(error?.textContent).toBe('unsupported');
    expect(requestPermission).not.toHaveBeenCalled();
    expect(sessionFactory.createSession).not.toHaveBeenCalled();

    unmount();
  });
});
