import { describe, expect, it } from 'vitest';
import {
  insertTranscriptAtCaret,
  resolveVoicePressAction,
  shouldHandleVoiceHotkey,
} from '../src/renderer/lib/voice/voice-input-utils';

describe('insertTranscriptAtCaret', () => {
  it('inserts trimmed transcript into an empty input', () => {
    const result = insertTranscriptAtCaret({
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      transcript: '  hello world  ',
    });

    expect(result).toEqual({
      value: 'hello world',
      selectionStart: 11,
      selectionEnd: 11,
      insertedText: 'hello world',
    });
  });

  it('replaces the current selection with the transcript', () => {
    const result = insertTranscriptAtCaret({
      value: 'alpha beta',
      selectionStart: 6,
      selectionEnd: 10,
      transcript: 'gamma',
    });

    expect(result).toEqual({
      value: 'alpha gamma',
      selectionStart: 11,
      selectionEnd: 11,
      insertedText: 'gamma',
    });
  });

  it('adds a leading space when inserting after a word character', () => {
    const result = insertTranscriptAtCaret({
      value: 'alpha',
      selectionStart: 5,
      selectionEnd: 5,
      transcript: 'beta',
    });

    expect(result).toEqual({
      value: 'alpha beta',
      selectionStart: 10,
      selectionEnd: 10,
      insertedText: ' beta',
    });
  });

  it('does not add a leading space after whitespace, newlines, or opening brackets', () => {
    const whitespace = insertTranscriptAtCaret({
      value: 'alpha ',
      selectionStart: 6,
      selectionEnd: 6,
      transcript: 'beta',
    });
    const newline = insertTranscriptAtCaret({
      value: 'alpha\n',
      selectionStart: 6,
      selectionEnd: 6,
      transcript: 'beta',
    });
    const bracket = insertTranscriptAtCaret({
      value: 'alpha(',
      selectionStart: 6,
      selectionEnd: 6,
      transcript: 'beta',
    });

    expect(whitespace.insertedText).toBe('beta');
    expect(whitespace.value).toBe('alpha beta');
    expect(newline.insertedText).toBe('beta');
    expect(newline.value).toBe('alpha\nbeta');
    expect(bracket.insertedText).toBe('beta');
    expect(bracket.value).toBe('alpha(beta');
  });
});

describe('shouldHandleVoiceHotkey', () => {
  it('allows space on chat view when there is an active task and no blockers', () => {
    expect(shouldHandleVoiceHotkey({
      key: ' ',
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      hasActiveTask: true,
      mainView: 'chat',
      settingsOpen: false,
    })).toBe(true);
  });

  it('rejects the hotkey when view or modifier state makes it unsafe', () => {
    expect(shouldHandleVoiceHotkey({
      key: ' ',
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      hasActiveTask: true,
      mainView: 'files',
      settingsOpen: false,
    })).toBe(false);

    expect(shouldHandleVoiceHotkey({
      key: ' ',
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: false,
      isComposing: false,
      hasActiveTask: true,
      mainView: 'chat',
      settingsOpen: false,
    })).toBe(false);

    expect(shouldHandleVoiceHotkey({
      key: ' ',
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: true,
      hasActiveTask: true,
      mainView: 'chat',
      settingsOpen: false,
    })).toBe(false);

    expect(shouldHandleVoiceHotkey({
      key: ' ',
      repeat: true,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      hasActiveTask: true,
      mainView: 'chat',
      settingsOpen: false,
    })).toBe(false);

    expect(shouldHandleVoiceHotkey({
      key: 'Enter',
      repeat: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      isComposing: false,
      hasActiveTask: true,
      mainView: 'chat',
      settingsOpen: false,
    })).toBe(false);
  });
});

describe('resolveVoicePressAction', () => {
  it('treats presses shorter than the threshold as a normal space', () => {
    expect(resolveVoicePressAction(219, 220)).toBe('insert-space');
  });

  it('treats presses at or beyond the threshold as voice activation', () => {
    expect(resolveVoicePressAction(220, 220)).toBe('start-voice');
    expect(resolveVoicePressAction(480, 220)).toBe('start-voice');
  });
});
