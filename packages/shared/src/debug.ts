const REDACTED = '***redacted***';
const TRUNCATE_AT = 500;
const SECRET_KEY_RE = /(token|password|secret|authorization|cookie)/i;

export type DebugLevel = 'debug' | 'info' | 'warn' | 'error';
export type DebugDomain = 'app' | 'gateway' | 'ipc' | 'renderer' | 'db' | 'workspace' | 'artifact' | 'debug';

export interface DebugError {
  name?: string;
  message: string;
  stack?: string;
  code?: string;
}

export interface DebugEvent {
  ts: string;
  level: DebugLevel;
  domain: DebugDomain;
  event: string;
  traceId?: string;
  feature?: string;
  message?: string;
  gatewayId?: string;
  sessionKey?: string;
  taskId?: string;
  runId?: string;
  requestId?: string;
  wsFrameId?: string;
  seq?: number;
  attempt?: number;
  durationMs?: number;
  ok?: boolean;
  error?: DebugError;
  data?: Record<string, unknown>;
}

export function truncateForLog(value: string, maxLen = TRUNCATE_AT): string {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen)}…<truncated len=${value.length}>`;
}

export function sanitizeForLog<T>(value: T): T {
  return sanitizeValue(value) as T;
}

export function summarizePayload<T>(value: T): T {
  return sanitizeForLog(value);
}

function sanitizeValue(value: unknown, key?: string): unknown {
  if (key && SECRET_KEY_RE.test(key)) {
    return REDACTED;
  }

  if (typeof value === 'string') {
    return truncateForLog(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    output[entryKey] = sanitizeValue(entryValue, entryKey);
  }
  return output;
}
