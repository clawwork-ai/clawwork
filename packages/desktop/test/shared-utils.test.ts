import { describe, it, expect } from 'vitest';
import {
  buildSessionKey,
  parseTaskIdFromSessionKey,
  parseAgentIdFromSessionKey,
  isClawWorkSession,
  mergeGatewayStreamText,
  SESSION_KEY_PREFIX,
} from '@clawwork/shared';

describe('buildSessionKey', () => {
  it('creates a session key from a task id', () => {
    expect(buildSessionKey('abc-123')).toBe('agent:main:clawwork:task:abc-123');
  });

  it('creates a session key with custom agentId', () => {
    expect(buildSessionKey('abc-123', 'research')).toBe('agent:research:clawwork:task:abc-123');
  });

  it('round-trips through parseTaskIdFromSessionKey', () => {
    const taskId = 'my-task-uuid';
    const key = buildSessionKey(taskId);
    expect(parseTaskIdFromSessionKey(key)).toBe(taskId);
  });

  it('round-trips with custom agentId', () => {
    const taskId = 'task-uuid';
    const key = buildSessionKey(taskId, 'code-review');
    expect(parseTaskIdFromSessionKey(key)).toBe(taskId);
    expect(parseAgentIdFromSessionKey(key)).toBe('code-review');
  });
});

describe('parseTaskIdFromSessionKey', () => {
  it('extracts task id from a clawwork session key', () => {
    expect(parseTaskIdFromSessionKey(`${SESSION_KEY_PREFIX}task-42`)).toBe('task-42');
  });

  it('extracts task id from non-main agent session key', () => {
    expect(parseTaskIdFromSessionKey('agent:research:clawwork:task:task-99')).toBe('task-99');
  });

  it('handles legacy session key format', () => {
    expect(parseTaskIdFromSessionKey('agent:my-agent:task-legacy-id')).toBe('legacy-id');
  });

  it('returns null for unrecognised keys', () => {
    expect(parseTaskIdFromSessionKey('random-garbage')).toBeNull();
  });

  it('returns null for prefix-only key (empty task id)', () => {
    expect(parseTaskIdFromSessionKey(SESSION_KEY_PREFIX)).toBeNull();
  });
});

describe('parseAgentIdFromSessionKey', () => {
  it('extracts agent id from session key', () => {
    expect(parseAgentIdFromSessionKey('agent:research:clawwork:task:t1')).toBe('research');
  });

  it('defaults to main for unrecognised keys', () => {
    expect(parseAgentIdFromSessionKey('random-garbage')).toBe('main');
  });
});

describe('isClawWorkSession', () => {
  it('returns true for clawwork session keys', () => {
    expect(isClawWorkSession(`${SESSION_KEY_PREFIX}task-1`)).toBe(true);
  });

  it('returns true for non-main agent clawwork keys', () => {
    expect(isClawWorkSession('agent:research:clawwork:task:t1')).toBe(true);
  });

  it('returns false for other session keys', () => {
    expect(isClawWorkSession('agent:main:task-1')).toBe(false);
  });
});

describe('mergeGatewayStreamText', () => {
  it('returns incoming when previous is empty', () => {
    expect(mergeGatewayStreamText('', 'hello')).toBe('hello');
  });

  it('ignores empty incoming', () => {
    expect(mergeGatewayStreamText('existing', '')).toBe('existing');
  });

  it('deduplicates identical frames', () => {
    expect(mergeGatewayStreamText('hello', 'hello')).toBe('hello');
  });

  it('handles cumulative snapshot (incoming is superset)', () => {
    expect(mergeGatewayStreamText('hel', 'hello world')).toBe('hello world');
  });

  it('ignores stale snapshot replay (incoming is subset)', () => {
    expect(mergeGatewayStreamText('hello world', 'hello')).toBe('hello world');
  });

  it('concatenates true incremental delta', () => {
    expect(mergeGatewayStreamText('hello', ' world')).toBe('hello world');
  });
});
