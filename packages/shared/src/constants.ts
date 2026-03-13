// ============================================================
// Shared Constants
// ============================================================

/** Default OpenClaw Gateway WebSocket port */
export const GATEWAY_WS_PORT = 18789;

/** ClawWork session key prefix: agent:main:clawwork:task: */
export const SESSION_KEY_PREFIX = 'agent:main:clawwork:task:';
const LEGACY_SESSION_KEY_RE = /^agent:[^:]+:task-(.+)$/;

/** Build a session key from taskId (fixed to main agent) */
export function buildSessionKey(taskId: string): string {
  return `${SESSION_KEY_PREFIX}${taskId}`;
}

/** Extract taskId from a ClawWork session key */
export function parseTaskIdFromSessionKey(sessionKey: string): string | null {
  if (sessionKey.startsWith(SESSION_KEY_PREFIX)) {
    return sessionKey.slice(SESSION_KEY_PREFIX.length) || null;
  }

  // Keep old task sessions renderable after the gateway-only key migration.
  const legacyMatch = sessionKey.match(LEGACY_SESSION_KEY_RE);
  return legacyMatch ? legacyMatch[1] : null;
}

/**
 * Merge streaming chat text from Gateway.
 * Handles cumulative snapshots, duplicate frames, and true incremental chunks.
 */
export function mergeGatewayStreamText(previous: string, incoming: string): string {
  if (!incoming) return previous;
  if (incoming === previous) return previous;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  return previous + incoming;
}

/** Check if a session key belongs to ClawWork */
export function isClawWorkSession(sessionKey: string): boolean {
  return sessionKey.startsWith(SESSION_KEY_PREFIX);
}

/** Heartbeat interval in milliseconds */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** Reconnect delay in milliseconds */
export const RECONNECT_DELAY_MS = 3_000;

/** Max reconnect attempts before giving up */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** Default workspace directory name (under user home) */
export const DEFAULT_WORKSPACE_DIR = 'ClawWork-Workspace';

/** Config file name stored in Electron userData */
export const CONFIG_FILE_NAME = 'clawwork-config.json';

/** SQLite database file name within workspace */
export const DB_FILE_NAME = '.clawwork.db';
