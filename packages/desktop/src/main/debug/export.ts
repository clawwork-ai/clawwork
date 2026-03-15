import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sanitizeForLog } from '@clawwork/shared';
import type { DebugEvent } from '@clawwork/shared';
import type { DebugLogger } from './logger.js';

export interface ExportDebugBundleOptions {
  outputDir: string;
  logger: DebugLogger;
  meta?: {
    gatewayStatus?: Record<string, unknown>;
    config?: Record<string, unknown>;
    environment?: Record<string, unknown>;
  };
  filter?: {
    gatewayId?: string;
    sessionKey?: string;
    taskId?: string;
    limit?: number;
  };
}

export function exportDebugBundle(options: ExportDebugBundleOptions): { bundlePath: string; events: DebugEvent[] } {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bundlePath = join(options.outputDir, `bundle-${stamp}`);
  mkdirSync(bundlePath, { recursive: true });

  const events = options.logger.getRecentEvents(options.filter);
  writeFileSync(join(bundlePath, 'recent-events.ndjson'), events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : ''), 'utf8');
  writeFileSync(join(bundlePath, 'timeline.json'), JSON.stringify({ events }, null, 2), 'utf8');
  writeFileSync(join(bundlePath, 'gateway-status.json'), JSON.stringify(sanitizeForLog(options.meta?.gatewayStatus ?? {}), null, 2), 'utf8');
  writeFileSync(join(bundlePath, 'config.sanitized.json'), JSON.stringify(sanitizeForLog(options.meta?.config ?? {}), null, 2), 'utf8');
  writeFileSync(join(bundlePath, 'environment.json'), JSON.stringify(sanitizeForLog(options.meta?.environment ?? {}), null, 2), 'utf8');

  return { bundlePath, events };
}
