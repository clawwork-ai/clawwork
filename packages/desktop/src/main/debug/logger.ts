import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DebugDomain, DebugEvent, DebugLevel } from '@clawwork/shared';
import { sanitizeForLog } from '@clawwork/shared';

export interface CreateDebugLoggerOptions {
  debugDir: string;
  maxEvents?: number;
  console?: boolean;
  onEvent?: (event: DebugEvent) => void;
}

export interface DebugLogFilter {
  level?: DebugLevel[];
  domain?: DebugDomain[];
  gatewayId?: string;
  sessionKey?: string;
  taskId?: string;
  traceId?: string;
  feature?: string;
  limit?: number;
}

export interface DebugLogger {
  debug: (input: LogEventInput) => DebugEvent;
  info: (input: LogEventInput) => DebugEvent;
  warn: (input: LogEventInput) => DebugEvent;
  error: (input: LogEventInput) => DebugEvent;
  log: (input: LogEventInput & { level: DebugLevel }) => DebugEvent;
  getRecentEvents: (filter?: DebugLogFilter) => DebugEvent[];
  currentFilePath: () => string;
}

export interface LogEventInput {
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
  error?: DebugEvent['error'];
  data?: Record<string, unknown>;
}

export function createDebugLogger(options: CreateDebugLoggerOptions): DebugLogger {
  const maxEvents = options.maxEvents ?? 1000;
  const writeConsole = options.console ?? true;
  const recentEvents: DebugEvent[] = [];

  ensureDir(options.debugDir);

  function log(input: LogEventInput & { level: DebugLevel }): DebugEvent {
    const event: DebugEvent = sanitizeForLog({
      ts: new Date().toISOString(),
      ...input,
    });

    recentEvents.push(event);
    if (recentEvents.length > maxEvents) {
      recentEvents.splice(0, recentEvents.length - maxEvents);
    }

    appendFileSync(currentFilePath(), `${JSON.stringify(event)}\n`, 'utf8');

    if (writeConsole) {
      const line = `[${event.level}] [${event.domain}] ${event.event}`;
      if (event.level === 'error') console.error(line, event);
      else if (event.level === 'warn') console.warn(line, event);
      else console.log(line, event);
    }

    options.onEvent?.(event);
    return event;
  }

  return {
    debug: (input) => log({ ...input, level: 'debug' }),
    info: (input) => log({ ...input, level: 'info' }),
    warn: (input) => log({ ...input, level: 'warn' }),
    error: (input) => log({ ...input, level: 'error' }),
    log,
    getRecentEvents: (filter) => filterEvents(recentEvents, filter),
    currentFilePath,
  };

  function currentFilePath(): string {
    const day = new Date().toISOString().slice(0, 10);
    return join(options.debugDir, `debug-${day}.ndjson`);
  }
}

function filterEvents(events: DebugEvent[], filter?: DebugLogFilter): DebugEvent[] {
  let result = [...events];
  if (!filter) return result;
  if (filter.level?.length) result = result.filter((event) => filter.level!.includes(event.level));
  if (filter.domain?.length) result = result.filter((event) => filter.domain!.includes(event.domain));
  if (filter.gatewayId) result = result.filter((event) => event.gatewayId === filter.gatewayId);
  if (filter.sessionKey) result = result.filter((event) => event.sessionKey === filter.sessionKey);
  if (filter.taskId) result = result.filter((event) => event.taskId === filter.taskId);
  if (filter.traceId) result = result.filter((event) => event.traceId === filter.traceId);
  if (filter.feature) result = result.filter((event) => event.feature === filter.feature);
  if (filter.limit && filter.limit > 0) result = result.slice(-filter.limit);
  return result;
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
