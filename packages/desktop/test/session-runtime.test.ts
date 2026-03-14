import { describe, expect, it } from 'vitest';
import {
  deriveTaskRuntime,
  normalizeModelCatalog,
  formatTokenCompact,
  formatContextPercent,
  buildSessionPatchPayload,
} from '../src/renderer/lib/session-runtime';

describe('normalizeModelCatalog', () => {
  it('normalizes models.list payload into unique provider/model options', () => {
    const normalized = normalizeModelCatalog({
      models: [
        { id: 'openai-codex/gpt-5.4', provider: 'openai-codex', model: 'gpt-5.4', label: 'GPT-5.4' },
        { id: 'github-copilot/claude-sonnet-4.6', provider: 'github-copilot', model: 'claude-sonnet-4.6' },
        { id: 'openai-codex/gpt-5.4', provider: 'openai-codex', model: 'gpt-5.4' },
      ],
    });

    expect(normalized).toEqual([
      { id: 'github-copilot/claude-sonnet-4.6', label: 'github-copilot/claude-sonnet-4.6', provider: 'github-copilot', model: 'claude-sonnet-4.6' },
      { id: 'openai-codex/gpt-5.4', label: 'GPT-5.4', provider: 'openai-codex', model: 'gpt-5.4' },
    ]);
  });
});

describe('deriveTaskRuntime', () => {
  it('extracts session runtime info from a sessions.list row', () => {
    const runtime = deriveTaskRuntime({
      key: 'agent:main:clawwork:task:abc',
      sessionId: 'session-1',
      modelProvider: 'openai-codex',
      model: 'gpt-5.4',
      authProfileOverride: 'openai-codex:default',
      thinkingLevel: 'high',
      reasoningLevel: 'stream',
      inputTokens: 547000,
      outputTokens: 6600,
      totalTokens: 553600,
      contextTokens: 400000,
    });

    expect(runtime).toEqual({
      sessionId: 'session-1',
      modelProvider: 'openai-codex',
      model: 'gpt-5.4',
      authProfileOverride: 'openai-codex:default',
      thinkingLevel: 'high',
      reasoningLevel: 'stream',
      inputTokens: 547000,
      outputTokens: 6600,
      totalTokens: 553600,
      contextTokens: 400000,
      contextPercent: 137,
    });
  });

  it('returns null when the row does not carry runtime fields', () => {
    expect(deriveTaskRuntime({ key: 'agent:main:clawwork:task:abc' })).toBeNull();
  });
});

describe('buildSessionPatchPayload', () => {
  it('builds a model patch payload', () => {
    expect(buildSessionPatchPayload('session-key', { model: 'github-copilot/gemini-2.5-pro' })).toEqual({
      key: 'session-key',
      model: 'github-copilot/gemini-2.5-pro',
    });
  });

  it('builds a thinking patch payload', () => {
    expect(buildSessionPatchPayload('session-key', { thinkingLevel: 'medium' })).toEqual({
      key: 'session-key',
      thinkingLevel: 'medium',
    });
  });
});

describe('runtime formatting helpers', () => {
  it('formats large token counts compactly', () => {
    expect(formatTokenCompact(547000)).toBe('547k');
    expect(formatTokenCompact(6600)).toBe('6.6k');
  });

  it('formats context percentage when possible', () => {
    expect(formatContextPercent(137)).toBe('ctx 137%');
    expect(formatContextPercent(null)).toBeNull();
  });
});
