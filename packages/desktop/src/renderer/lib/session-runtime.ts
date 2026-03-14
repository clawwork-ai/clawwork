import type { ModelOption, TaskRuntimeInfo } from '@clawwork/shared';

interface SessionRowLike {
  sessionId?: string;
  modelProvider?: string;
  model?: string;
  authProfileOverride?: string;
  thinkingLevel?: string;
  reasoningLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  contextTokens?: number;
}

interface ModelCatalogLike {
  models?: Array<{
    id?: string;
    label?: string;
    provider?: string;
    model?: string;
  }>;
}

export function deriveTaskRuntime(row: SessionRowLike): TaskRuntimeInfo | null {
  const hasRuntime = [
    row.sessionId,
    row.modelProvider,
    row.model,
    row.authProfileOverride,
    row.thinkingLevel,
    row.reasoningLevel,
    row.inputTokens,
    row.outputTokens,
    row.totalTokens,
    row.contextTokens,
  ].some((value) => value !== undefined && value !== null && value !== '');

  if (!hasRuntime) {
    return null;
  }

  const inputTokens = toNumber(row.inputTokens);
  const outputTokens = toNumber(row.outputTokens);
  const totalTokens = toNumber(row.totalTokens) ?? sumNullable(inputTokens, outputTokens);
  const contextTokens = toNumber(row.contextTokens);
  const contextPercent =
    inputTokens != null && contextTokens != null && contextTokens > 0
      ? Math.round((inputTokens / contextTokens) * 100)
      : null;

  return {
    sessionId: normalizeString(row.sessionId),
    modelProvider: normalizeString(row.modelProvider),
    model: normalizeString(row.model),
    authProfileOverride: normalizeString(row.authProfileOverride),
    thinkingLevel: normalizeString(row.thinkingLevel),
    reasoningLevel: normalizeString(row.reasoningLevel),
    inputTokens,
    outputTokens,
    totalTokens,
    contextTokens,
    contextPercent,
  };
}

export function normalizeModelCatalog(payload: ModelCatalogLike): ModelOption[] {
  const dedup = new Map<string, ModelOption>();

  for (const entry of payload.models ?? []) {
    const provider = normalizeString(entry.provider);
    const model = normalizeString(entry.model);
    const fallbackId = normalizeString(entry.id);
    const id = fallbackId ?? (provider && model ? `${provider}/${model}` : null);
    if (!id) continue;

    if (dedup.has(id)) {
      // Prefer keeping explicit label over id fallback
      const existing = dedup.get(id)!;
      const newLabel = normalizeString(entry.label);
      if (newLabel && existing.label === id) {
        dedup.set(id, { ...existing, label: newLabel });
      }
      continue;
    }

    dedup.set(id, {
      id,
      provider: provider ?? id.split('/')[0] ?? null,
      model: model ?? (id.split('/').slice(1).join('/') || null),
      label: normalizeString(entry.label) ?? id,
    });
  }

  return [...dedup.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildSessionPatchPayload(
  sessionKey: string,
  patch: { model?: string; thinkingLevel?: string },
): Record<string, string> {
  const payload: Record<string, string> = { key: sessionKey };
  if (patch.model) payload.model = patch.model;
  if (patch.thinkingLevel) payload.thinkingLevel = patch.thinkingLevel;
  return payload;
}

export function formatTokenCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '0';
  if (value >= 1_000_000) return `${trimTrailing((value / 1_000_000).toFixed(1))}M`;
  if (value >= 1_000) return `${trimTrailing((value / 1_000).toFixed(1))}k`;
  return String(Math.round(value));
}

export function formatContextPercent(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `ctx ${Math.round(value)}%`;
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sumNullable(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function trimTrailing(value: string): string {
  return value.replace(/\.0$/, '');
}
