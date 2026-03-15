type MainView = 'chat' | 'files' | 'archived';

interface InsertTranscriptParams {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  transcript: string;
}

interface InsertTranscriptResult {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  insertedText: string;
}

interface VoiceHotkeyParams {
  key: string;
  repeat: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing: boolean;
  hasActiveTask: boolean;
  mainView: MainView;
  settingsOpen: boolean;
}

export function insertTranscriptAtCaret({
  value,
  selectionStart,
  selectionEnd,
  transcript,
}: InsertTranscriptParams): InsertTranscriptResult {
  const trimmedTranscript = transcript.trim();
  if (!trimmedTranscript) {
    return {
      value,
      selectionStart,
      selectionEnd,
      insertedText: '',
    };
  }

  const prefix = needsLeadingSpace(value, selectionStart) ? ' ' : '';
  const insertedText = `${prefix}${trimmedTranscript}`;
  const nextValue = `${value.slice(0, selectionStart)}${insertedText}${value.slice(selectionEnd)}`;
  const nextCaret = selectionStart + insertedText.length;

  return {
    value: nextValue,
    selectionStart: nextCaret,
    selectionEnd: nextCaret,
    insertedText,
  };
}

export function shouldHandleVoiceHotkey({
  key,
  repeat,
  altKey,
  ctrlKey,
  metaKey,
  shiftKey,
  isComposing,
  hasActiveTask,
  mainView,
  settingsOpen,
}: VoiceHotkeyParams): boolean {
  if (key !== ' ') return false;
  if (repeat || altKey || ctrlKey || metaKey || shiftKey || isComposing) return false;
  if (!hasActiveTask || mainView !== 'chat' || settingsOpen) return false;
  return true;
}

export function resolveVoicePressAction(durationMs: number, thresholdMs: number): 'insert-space' | 'start-voice' {
  return durationMs >= thresholdMs ? 'start-voice' : 'insert-space';
}

function needsLeadingSpace(value: string, selectionStart: number): boolean {
  if (selectionStart <= 0) return false;
  const previousChar = value[selectionStart - 1];
  return !/\s/.test(previousChar) && previousChar !== '(';
}
