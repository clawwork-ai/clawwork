import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDebugLogger } from '../src/main/debug/logger';
import { sanitizeForLog, summarizePayload } from '@clawwork/shared';

describe('debug observability foundation', () => {
  it('redacts secrets and truncates long strings', () => {
    const result = sanitizeForLog({
      token: 'secret-token',
      nested: { password: 'pw123' },
      text: 'x'.repeat(520),
    }) as Record<string, unknown>;

    expect(result.token).toBe('***redacted***');
    expect((result.nested as Record<string, unknown>).password).toBe('***redacted***');
    expect(result.text).toBe('x'.repeat(500) + '…<truncated len=520>');
  });

  it('summarizes large payloads without leaking full content', () => {
    const result = summarizePayload({
      message: 'hello world',
      attachment: {
        content: 'a'.repeat(900),
        mimeType: 'text/plain',
      },
    }) as Record<string, unknown>;

    expect((result.attachment as Record<string, unknown>).content).toBe('a'.repeat(500) + '…<truncated len=900>');
    expect(result.message).toBe('hello world');
  });

  describe('createDebugLogger', () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'clawwork-debug-'));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it('stores recent events and writes ndjson to disk', () => {
      const seen: string[] = [];
      const logger = createDebugLogger({
        debugDir: dir,
        maxEvents: 3,
        console: false,
        onEvent: (event) => {
          seen.push(event.event);
        },
      });

      logger.info({ domain: 'gateway', event: 'gateway.connect.start', gatewayId: 'gw-1' });
      logger.error({ domain: 'ipc', event: 'ipc.ws.send-message.failed', error: { message: 'not connected' } });

      const events = logger.getRecentEvents();
      expect(events).toHaveLength(2);
      expect(events[0]?.event).toBe('gateway.connect.start');
      expect(events[1]?.level).toBe('error');

      const file = logger.currentFilePath();
      const lines = readFileSync(file, 'utf8').trim().split('\n');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[1]!).error.message).toBe('not connected');
      expect(seen).toEqual(['gateway.connect.start', 'ipc.ws.send-message.failed']);
    });

    it('keeps only the newest events in memory', () => {
      const logger = createDebugLogger({
        debugDir: dir,
        maxEvents: 2,
        console: false,
      });

      logger.debug({ domain: 'gateway', event: 'one' });
      logger.debug({ domain: 'gateway', event: 'two' });
      logger.debug({ domain: 'gateway', event: 'three' });

      const events = logger.getRecentEvents();
      expect(events.map((event) => event.event)).toEqual(['two', 'three']);
    });
  });
});
