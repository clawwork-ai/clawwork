import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import {
  insertTranscriptAtCaret,
  resolveVoicePressAction,
  shouldHandleVoiceHotkey,
} from '@/lib/voice/voice-input-utils';
import type { CreateVoiceSessionHandlers, VoiceErrorCode, VoicePermissionStatus, VoiceSession } from '@/lib/voice/types';

export type { CreateVoiceSessionHandlers, VoiceErrorCode, VoicePermissionStatus, VoiceSession } from '@/lib/voice/types';

interface UseVoiceInputOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  hasActiveTask: boolean;
  activeTaskKey?: string | null;
  mainView: 'chat' | 'files' | 'archived';
  settingsOpen: boolean;
  loadIntroSeen: () => Promise<boolean>;
  markIntroSeen: () => Promise<void>;
  requestPermission: () => Promise<VoicePermissionStatus>;
  createSession: (handlers: CreateVoiceSessionHandlers) => VoiceSession | null;
  pressHoldDelayMs?: number;
  isSupported?: boolean;
  onTextInserted?: () => void;
}

interface UseVoiceInputResult {
  isSupported: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  isIntroOpen: boolean;
  interimTranscript: string;
  errorCode: VoiceErrorCode | null;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleKeyUp: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  confirmIntro: () => Promise<void>;
  dismissIntro: () => void;
  startFromTrigger: () => Promise<void>;
  stopListening: () => void;
}

export function useVoiceInput({
  textareaRef,
  hasActiveTask,
  activeTaskKey,
  mainView,
  settingsOpen,
  loadIntroSeen,
  markIntroSeen,
  requestPermission,
  createSession,
  pressHoldDelayMs = 220,
  isSupported = true,
  onTextInserted,
}: UseVoiceInputOptions): UseVoiceInputResult {
  const [isIntroOpen, setIsIntroOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [errorCode, setErrorCode] = useState<VoiceErrorCode | null>(null);

  const sessionRef = useRef<VoiceSession | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const pressStartedAtRef = useRef<number | null>(null);
  const pressActiveRef = useRef(false);
  const startedFromCurrentPressRef = useRef(false);
  const isListeningRef = useRef(false);
  const introSeenRef = useRef(false);
  const startRequestIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadIntroSeen().then((seen) => {
      if (cancelled) return;
      introSeenRef.current = seen;
    });
    return () => {
      cancelled = true;
    };
  }, [loadIntroSeen]);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current != null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const releaseSession = useCallback((shouldStop: boolean) => {
    const session = sessionRef.current;
    sessionRef.current = null;
    if (!session) return;
    if (shouldStop) {
      session.stop();
    } else {
      session.destroy?.();
    }
  }, []);

  const clearListeningState = useCallback(() => {
    setIsListening(false);
    isListeningRef.current = false;
    setInterimTranscript('');
  }, []);

  const stopListening = useCallback(() => {
    clearHoldTimer();
    const wasListening = isListeningRef.current;
    releaseSession(true);
    clearListeningState();
    if (wasListening) {
      setIsTranscribing(true);
    }
  }, [clearHoldTimer, releaseSession, clearListeningState]);

  const insertIntoTextarea = useCallback((transcript: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const result = insertTranscriptAtCaret({
      value: textarea.value,
      selectionStart: textarea.selectionStart ?? textarea.value.length,
      selectionEnd: textarea.selectionEnd ?? textarea.value.length,
      transcript,
    });

    textarea.value = result.value;
    textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    onTextInserted?.();
  }, [textareaRef, onTextInserted]);

  const insertLiteralSpace = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const selectionStart = textarea.selectionStart ?? textarea.value.length;
    const selectionEnd = textarea.selectionEnd ?? textarea.value.length;
    const nextValue = `${textarea.value.slice(0, selectionStart)} ${textarea.value.slice(selectionEnd)}`;
    const nextCaret = selectionStart + 1;
    textarea.value = nextValue;
    textarea.setSelectionRange(nextCaret, nextCaret);
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    onTextInserted?.();
  }, [textareaRef, onTextInserted]);

  const beginListening = useCallback(async (requiresActivePress: boolean) => {
    if (!isSupported) {
      setErrorCode('unsupported');
      return;
    }

    setErrorCode(null);
    const requestId = startRequestIdRef.current + 1;
    startRequestIdRef.current = requestId;

    const permissionStatus = await requestPermission();

    if (startRequestIdRef.current !== requestId) return;
    if (requiresActivePress && !pressActiveRef.current) return;

    if (permissionStatus !== 'granted') {
      setErrorCode(
        permissionStatus === 'unsupported'
          ? 'unsupported'
          : 'permission-denied',
      );
      clearListeningState();
      return;
    }

    const session = createSession({
      onInterimResult: (text) => {
        setInterimTranscript(text);
      },
      onFinalResult: (text) => {
        setInterimTranscript('');
        setIsTranscribing(false);
        insertIntoTextarea(text);
      },
      onError: (code) => {
        setErrorCode(code);
        setIsTranscribing(false);
        releaseSession(false);
        clearListeningState();
      },
      onEnd: () => {
        setIsTranscribing(false);
        releaseSession(false);
        clearListeningState();
      },
    });

    if (!session) {
      setErrorCode('unsupported');
      clearListeningState();
      return;
    }

    sessionRef.current = session;
    session.start();
    startedFromCurrentPressRef.current = requiresActivePress;
    setInterimTranscript('');
    setIsListening(true);
    isListeningRef.current = true;
  }, [isSupported, requestPermission, createSession, insertIntoTextarea, releaseSession, clearListeningState]);

  const handleLongPress = useCallback(() => {
    clearHoldTimer();
    if (!introSeenRef.current) {
      setIsIntroOpen(true);
      return;
    }
    void beginListening(true);
  }, [clearHoldTimer, beginListening]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === ' ' && pressActiveRef.current) {
      event.preventDefault();
      return;
    }
    if (!isSupported) return;
    if (!shouldHandleVoiceHotkey({
      key: event.key,
      repeat: event.repeat,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      isComposing: event.nativeEvent.isComposing,
      hasActiveTask,
      mainView,
      settingsOpen,
    })) {
      return;
    }

    event.preventDefault();
    clearHoldTimer();
    pressActiveRef.current = true;
    pressStartedAtRef.current = Date.now();
    startedFromCurrentPressRef.current = false;
    holdTimerRef.current = window.setTimeout(handleLongPress, pressHoldDelayMs);
  }, [hasActiveTask, isSupported, mainView, settingsOpen, clearHoldTimer, handleLongPress, pressHoldDelayMs]);

  const handleKeyUp = useCallback((event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== ' ') return;
    if (pressStartedAtRef.current == null) return;

    event.preventDefault();
    const pressDuration = Date.now() - pressStartedAtRef.current;
    pressStartedAtRef.current = null;
    pressActiveRef.current = false;
    clearHoldTimer();

    if (isListeningRef.current || startedFromCurrentPressRef.current) {
      stopListening();
      return;
    }

    if (resolveVoicePressAction(pressDuration, pressHoldDelayMs) === 'insert-space') {
      insertLiteralSpace();
    }
  }, [clearHoldTimer, insertLiteralSpace, pressHoldDelayMs, stopListening]);

  const confirmIntro = useCallback(async () => {
    await markIntroSeen();
    introSeenRef.current = true;
    setIsIntroOpen(false);
  }, [markIntroSeen]);

  const dismissIntro = useCallback(() => {
    setIsIntroOpen(false);
  }, []);

  const startFromTrigger = useCallback(async () => {
    if (!hasActiveTask || mainView !== 'chat' || settingsOpen) return;
    if (!isSupported) {
      setErrorCode('unsupported');
      return;
    }
    if (!introSeenRef.current) {
      setIsIntroOpen(true);
      return;
    }
    await beginListening(false);
  }, [hasActiveTask, isSupported, mainView, settingsOpen, beginListening]);

  useEffect(() => {
    if (!isListening) return;
    const onWindowKeyUp = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== ' ') return;
      if (!isListeningRef.current) return;
      e.preventDefault();
      pressStartedAtRef.current = null;
      pressActiveRef.current = false;
      clearHoldTimer();
      stopListening();
    };
    window.addEventListener('keyup', onWindowKeyUp);
    return () => window.removeEventListener('keyup', onWindowKeyUp);
  }, [isListening, clearHoldTimer, stopListening]);

  useEffect(() => {
    if (!hasActiveTask || mainView !== 'chat' || settingsOpen) {
      stopListening();
    }
  }, [activeTaskKey, hasActiveTask, mainView, settingsOpen, stopListening]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      releaseSession(false);
    };
  }, [clearHoldTimer, releaseSession]);

  return {
    isSupported,
    isListening,
    isTranscribing,
    isIntroOpen,
    interimTranscript,
    errorCode,
    handleKeyDown,
    handleKeyUp,
    confirmIntro,
    dismissIntro,
    startFromTrigger,
    stopListening,
  };
}
