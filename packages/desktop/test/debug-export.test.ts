import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDebugLogger } from '../src/main/debug/logger';
import { exportDebugBundle } from '../src/main/debug/export';

describe('debug export', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'clawwork-debug-export-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('exports recent events and metadata into a bundle directory', () => {
    const logger = createDebugLogger({
      debugDir: dir,
      maxEvents: 20,
      console: false,
    });

    logger.info({ domain: 'gateway', event: 'gateway.req.sent', gatewayId: 'gw-1', sessionKey: 'agent:main:clawwork:task:task-1', taskId: 'task-1' });
    logger.error({ domain: 'ipc', event: 'ipc.ws.send-message.failed', gatewayId: 'gw-1', sessionKey: 'agent:main:clawwork:task:task-1', taskId: 'task-1', error: { message: 'timeout' } });

    const result = exportDebugBundle({
      outputDir: join(dir, 'bundles'),
      logger,
      meta: {
        gatewayStatus: { 'gw-1': { connected: false, name: 'Main Gateway' } },
        config: { token: 'secret-token', workspacePath: '/tmp/ws' },
        environment: { platform: 'darwin' },
      },
      filter: { gatewayId: 'gw-1', sessionKey: 'agent:main:clawwork:task:task-1' },
    });

    expect(existsSync(result.bundlePath)).toBe(true);
    expect(existsSync(join(result.bundlePath, 'recent-events.ndjson'))).toBe(true);
    expect(existsSync(join(result.bundlePath, 'gateway-status.json'))).toBe(true);
    expect(existsSync(join(result.bundlePath, 'config.sanitized.json'))).toBe(true);
    expect(existsSync(join(result.bundlePath, 'environment.json'))).toBe(true);

    const config = JSON.parse(readFileSync(join(result.bundlePath, 'config.sanitized.json'), 'utf8'));
    expect(config.token).toBe('***redacted***');

    const timeline = JSON.parse(readFileSync(join(result.bundlePath, 'timeline.json'), 'utf8'));
    expect(timeline.events).toHaveLength(2);
  });
});
