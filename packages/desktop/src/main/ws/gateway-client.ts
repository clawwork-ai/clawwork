import WebSocket from 'ws';
import { app } from 'electron';
import { randomUUID } from 'crypto';
import {
  HEARTBEAT_INTERVAL_MS,
  RECONNECT_DELAY_MS,
  MAX_RECONNECT_ATTEMPTS,
  parseTaskIdFromSessionKey,
  summarizePayload,
} from '@clawwork/shared';
import type {
  GatewayFrame,
  GatewayReqFrame,
  GatewayResFrame,
  GatewayConnectParams,
  GatewayClientConfig,
  GatewayAuth,
  ChatAttachment,
} from '@clawwork/shared';
import type { BrowserWindow } from 'electron';
import { sendToWindow } from './window-utils.js';
import {
  loadOrCreateDeviceIdentity,
  buildDeviceConnectPayload,
  saveDeviceToken,
  loadDeviceToken,
  type DeviceIdentity,
} from './device-identity.js';
import { getDebugLogger } from '../debug/index.js';

type PendingReq = {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
  startedAt: number;
  requestId: string;
  sessionKey?: string;
  taskId?: string;
};

const REQ_TIMEOUT_MS = 15_000;

export class GatewayClient {
  private ws: WebSocket | null = null;
  private mainWindow: BrowserWindow | null = null;
  private authenticated = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pendingRequests = new Map<string, PendingReq>();
  private destroyed = false;
  private noReconnect = false;
  private wsUrl: string;
  private auth: GatewayAuth;
  private gatewayId: string;
  private gatewayName: string;
  private connectNonce: string | null = null;
  private deviceIdentity: DeviceIdentity;

  constructor(config: GatewayClientConfig, opts?: { noReconnect?: boolean }) {
    this.gatewayId = config.id;
    this.gatewayName = config.name;
    this.wsUrl = config.url;
    this.auth = config.auth;
    this.deviceIdentity = loadOrCreateDeviceIdentity();
    if (opts?.noReconnect) this.noReconnect = true;
  }

  get id(): string {
    return this.gatewayId;
  }

  get name(): string {
    return this.gatewayName;
  }

  updateConfig(config: Partial<GatewayClientConfig>): void {
    if (config.id !== undefined) this.gatewayId = config.id;
    if (config.name !== undefined) this.gatewayName = config.name;
    if (config.url !== undefined) this.wsUrl = config.url;
    if (config.auth !== undefined) this.auth = config.auth;
    this.reconnectAttempts = 0;
    this.connect();
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  connect(): void {
    if (this.destroyed) return;
    this.cleanup();

    getDebugLogger().info({
      domain: 'gateway',
      event: 'gateway.connect.start',
      gatewayId: this.gatewayId,
      attempt: this.reconnectAttempts + 1,
      data: { wsUrl: this.wsUrl },
    });
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      getDebugLogger().info({
        domain: 'gateway',
        event: 'gateway.ws.open',
        gatewayId: this.gatewayId,
        message: 'Waiting for connect challenge',
      });
    });

    this.ws.on('message', (raw) => {
      this.handleRaw(raw.toString());
    });

    this.ws.on('close', (code, reason) => {
      const reasonStr = reason.toString();
      getDebugLogger().warn({
        domain: 'gateway',
        event: 'gateway.ws.close',
        gatewayId: this.gatewayId,
        data: {
          code,
          reason: reasonStr,
          pendingRequests: this.pendingRequests.size,
        },
      });
      this.authenticated = false;
      this.stopHeartbeat();
      if (this.mainWindow) {
        sendToWindow(this.mainWindow, 'gateway-status', {
          gatewayId: this.gatewayId,
          connected: false,
          ...(code === 1008 ? { error: reasonStr || 'policy violation' } : {}),
        });
      }
      // Don't retry when server explicitly rejects (pairing required, auth denied)
      if (code === 1008) return;
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      getDebugLogger().error({
        domain: 'gateway',
        event: 'gateway.ws.error',
        gatewayId: this.gatewayId,
        error: { name: err.name, message: err.message, stack: err.stack },
      });
    });
  }

  private handleRaw(raw: string): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(raw) as GatewayFrame;
    } catch {
      getDebugLogger().error({
        domain: 'gateway',
        event: 'gateway.frame.invalid-json',
        gatewayId: this.gatewayId,
        data: { raw },
      });
      return;
    }

    if (frame.type === 'event') {
      getDebugLogger().debug({
        domain: 'gateway',
        event: 'gateway.event.received',
        gatewayId: this.gatewayId,
        seq: frame.seq,
        data: {
          name: frame.event,
          payload: summarizePayload(frame.payload),
        },
      });
      this.handleEvent(frame);
      return;
    }

    if (frame.type === 'res') {
      this.handleResponse(frame);
      return;
    }
  }

  private handleEvent(frame: { event: string; payload: Record<string, unknown>; seq?: number }): void {
    if (frame.event === 'connect.challenge') {
      const nonce =
        frame.payload && typeof frame.payload.nonce === 'string'
          ? frame.payload.nonce.trim()
          : '';
      if (!nonce) {
        getDebugLogger().error({
          domain: 'gateway',
          event: 'gateway.challenge.invalid',
          gatewayId: this.gatewayId,
          data: { payload: summarizePayload(frame.payload) },
        });
        this.ws?.close(1008, 'connect challenge missing nonce');
        return;
      }
      this.connectNonce = nonce;
      getDebugLogger().info({
        domain: 'gateway',
        event: 'gateway.challenge.received',
        gatewayId: this.gatewayId,
        seq: frame.seq,
      });
      this.handleChallenge(nonce);
      return;
    }

    if (frame.event === 'tick') {
      getDebugLogger().debug({
        domain: 'gateway',
        event: 'gateway.tick.received',
        gatewayId: this.gatewayId,
        seq: frame.seq,
      });
      return;
    }

    const sessionKey = typeof frame.payload.sessionKey === 'string' ? frame.payload.sessionKey : undefined;
    const taskId = sessionKey ? parseTaskIdFromSessionKey(sessionKey) ?? undefined : undefined;
    getDebugLogger().debug({
      domain: 'gateway',
      event: `gateway.${frame.event.replace(/[^a-z0-9]+/gi, '.').toLowerCase()}`,
      gatewayId: this.gatewayId,
      sessionKey,
      taskId,
      seq: frame.seq,
      data: { payload: summarizePayload(frame.payload) },
    });

    if (this.mainWindow) {
      sendToWindow(this.mainWindow, 'gateway-event', {
        gatewayId: this.gatewayId,
        event: frame.event,
        payload: frame.payload,
        seq: frame.seq,
      });
    }
  }

  private buildAuthWithDeviceToken(): GatewayAuth {
    const storedToken = loadDeviceToken(this.gatewayId);
    if (storedToken) {
      return { ...this.auth, deviceToken: storedToken };
    }
    return this.auth;
  }

  private handleChallenge(nonce: string): void {
    const signatureToken = 'token' in this.auth ? this.auth.token : null;
    const scopes = ['operator.admin', 'operator.write', 'operator.read', 'operator.approvals', 'operator.pairing'];

    const device = buildDeviceConnectPayload(this.deviceIdentity, {
      clientId: 'gateway-client',
      clientMode: 'backend',
      role: 'operator',
      scopes,
      nonce,
      token: signatureToken,
      platform: process.platform,
      deviceFamily: null,
    });

    const params: GatewayConnectParams = {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'gateway-client',
        displayName: 'ClawWork Desktop',
        version: app.getVersion(),
        platform: process.platform,
        mode: 'backend',
      },
      caps: ['tool-events'],
      auth: this.buildAuthWithDeviceToken(),
      role: 'operator',
      scopes,
      device,
    };

    this.sendReq('connect', params as unknown as Record<string, unknown>, { requestId: 'connect-handshake' })
      .then((payload) => {
        const pType = payload['type'] as string | undefined;
        if (pType === 'hello-ok') {
          getDebugLogger().info({
            domain: 'gateway',
            event: 'gateway.connect.res.ok',
            gatewayId: this.gatewayId,
            requestId: 'connect-handshake',
          });
          this.authenticated = true;
          this.reconnectAttempts = 0;
          this.storeDeviceTokenFromPayload(payload);
          this.startHeartbeat();
          if (this.mainWindow) {
            sendToWindow(this.mainWindow, 'gateway-status', {
              gatewayId: this.gatewayId,
              connected: true,
            });
          }
        } else {
          getDebugLogger().error({
            domain: 'gateway',
            event: 'gateway.connect.res.unexpected',
            gatewayId: this.gatewayId,
            requestId: 'connect-handshake',
            data: { payload: summarizePayload(payload) },
          });
        }
      })
      .catch((err: Error) => {
        getDebugLogger().error({
          domain: 'gateway',
          event: 'gateway.connect.failed',
          gatewayId: this.gatewayId,
          requestId: 'connect-handshake',
          error: { name: err.name, message: err.message, stack: err.stack },
        });
        this.ws?.close();
      });
  }

  private storeDeviceTokenFromPayload(payload: Record<string, unknown>): void {
    const auth = payload['auth'] as Record<string, unknown> | undefined;
    if (!auth) return;
    const token = auth['deviceToken'];
    const role = auth['role'];
    const issuedAtMs = auth['issuedAtMs'];
    if (typeof token === 'string' && token) {
      saveDeviceToken(
        this.gatewayId,
        token,
        typeof role === 'string' ? role : 'operator',
        typeof issuedAtMs === 'number' ? issuedAtMs : Date.now(),
      );
      getDebugLogger().info({
        domain: 'gateway',
        event: 'gateway.auth.device-token.saved',
        gatewayId: this.gatewayId,
        data: { role: typeof role === 'string' ? role : 'operator' },
      });
    }
  }

  private handleResponse(frame: GatewayResFrame): void {
    const pending = this.pendingRequests.get(frame.id);
    if (!pending) {
      getDebugLogger().warn({
        domain: 'gateway',
        event: 'gateway.res.unmatched',
        gatewayId: this.gatewayId,
        wsFrameId: frame.id,
        data: { ok: frame.ok },
      });
      return;
    }
    this.pendingRequests.delete(frame.id);
    clearTimeout(pending.timer);
    const durationMs = Date.now() - pending.startedAt;

    if (frame.ok && frame.payload) {
      getDebugLogger().info({
        domain: 'gateway',
        event: 'gateway.res.received',
        gatewayId: this.gatewayId,
        requestId: pending.requestId,
        wsFrameId: frame.id,
        sessionKey: pending.sessionKey,
        taskId: pending.taskId,
        durationMs,
        ok: true,
        data: {
          method: pending.method,
          payload: summarizePayload(frame.payload),
        },
      });
      pending.resolve(frame.payload);
    } else {
      const errMsg = frame.error?.message ?? 'request failed';
      getDebugLogger().error({
        domain: 'gateway',
        event: 'gateway.res.error',
        gatewayId: this.gatewayId,
        requestId: pending.requestId,
        wsFrameId: frame.id,
        sessionKey: pending.sessionKey,
        taskId: pending.taskId,
        durationMs,
        ok: false,
        error: { message: errMsg, code: frame.error?.code },
        data: { method: pending.method },
      });
      pending.reject(new Error(errMsg));
    }
  }

  sendReq(
    method: string,
    params: Record<string, unknown>,
    meta?: { requestId?: string; sessionKey?: string; taskId?: string },
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        getDebugLogger().error({
          domain: 'gateway',
          event: 'gateway.req.rejected.not-connected',
          gatewayId: this.gatewayId,
          requestId: meta?.requestId,
          sessionKey: meta?.sessionKey,
          taskId: meta?.taskId,
          data: { method },
          error: { message: 'not connected' },
        });
        reject(new Error('not connected'));
        return;
      }

      const id = randomUUID();
      const requestId = meta?.requestId ?? randomUUID();
      const frame: GatewayReqFrame = { type: 'req', id, method, params };
      const startedAt = Date.now();

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        getDebugLogger().error({
          domain: 'gateway',
          event: 'gateway.req.timeout',
          gatewayId: this.gatewayId,
          requestId,
          wsFrameId: id,
          sessionKey: meta?.sessionKey,
          taskId: meta?.taskId,
          durationMs: Date.now() - startedAt,
          data: { method },
          error: { message: `request timeout: ${method}` },
        });
        reject(new Error(`request timeout: ${method}`));
      }, REQ_TIMEOUT_MS);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timer,
        method,
        startedAt,
        requestId,
        sessionKey: meta?.sessionKey,
        taskId: meta?.taskId,
      });
      getDebugLogger().debug({
        domain: 'gateway',
        event: 'gateway.req.sent',
        gatewayId: this.gatewayId,
        requestId,
        wsFrameId: id,
        sessionKey: meta?.sessionKey,
        taskId: meta?.taskId,
        data: {
          method,
          params: summarizePayload(params),
        },
      });
      this.ws.send(JSON.stringify(frame));
    });
  }

  async sendChatMessage(
    sessionKey: string,
    message: string,
    attachments?: ChatAttachment[],
  ): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = {
      sessionKey,
      message,
      idempotencyKey: randomUUID(),
      deliver: false,
    };
    if (attachments?.length) {
      params.attachments = attachments;
    }
    return this.sendReq('chat.send', params, {
      requestId: randomUUID(),
      sessionKey,
      taskId: parseTaskIdFromSessionKey(sessionKey) ?? undefined,
    });
  }

  async abortChat(sessionKey: string): Promise<Record<string, unknown>> {
    return this.sendReq('chat.abort', { sessionKey }, {
      requestId: randomUUID(),
      sessionKey,
      taskId: parseTaskIdFromSessionKey(sessionKey) ?? undefined,
    });
  }

  async getChatHistory(sessionKey: string, limit = 50): Promise<Record<string, unknown>> {
    return this.sendReq('chat.history', { sessionKey, limit }, {
      requestId: randomUUID(),
      sessionKey,
      taskId: parseTaskIdFromSessionKey(sessionKey) ?? undefined,
    });
  }

  async listSessions(): Promise<Record<string, unknown>> {
    return this.sendReq('sessions.list', {}, { requestId: randomUUID() });
  }

  async listModels(): Promise<Record<string, unknown>> {
    return this.sendReq('models.list', {});
  }

  async listAgents(): Promise<Record<string, unknown>> {
    return this.sendReq('agents.list', {});
  }

  async patchSession(params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.sendReq('sessions.patch', params);
  }

  get isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    getDebugLogger().info({
      domain: 'gateway',
      event: 'gateway.heartbeat.start',
      gatewayId: this.gatewayId,
    });
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendReq('health', {}, { requestId: `heartbeat-${Date.now()}` }).catch((err) => {
          getDebugLogger().warn({
            domain: 'gateway',
            event: 'gateway.heartbeat.failed',
            gatewayId: this.gatewayId,
            error: { message: err instanceof Error ? err.message : 'heartbeat failed' },
          });
        });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.noReconnect) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      getDebugLogger().error({
        domain: 'gateway',
        event: 'gateway.reconnect.give-up',
        gatewayId: this.gatewayId,
        attempt: this.reconnectAttempts,
        error: { message: 'max reconnect attempts reached' },
      });
      if (this.mainWindow) {
        sendToWindow(this.mainWindow, 'gateway-status', {
          gatewayId: this.gatewayId,
          connected: false,
          error: 'max reconnect attempts',
        });
      }
      return;
    }

    const delay = RECONNECT_DELAY_MS * Math.pow(2, Math.min(this.reconnectAttempts, 5));
    this.reconnectAttempts++;
    getDebugLogger().warn({
      domain: 'gateway',
      event: 'gateway.reconnect.scheduled',
      gatewayId: this.gatewayId,
      attempt: this.reconnectAttempts,
      data: { delay },
    });

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cleanup(): void {
    this.stopHeartbeat();
    this.connectNonce = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      getDebugLogger().warn({
        domain: 'gateway',
        event: 'gateway.req.cancelled.connection-closed',
        gatewayId: this.gatewayId,
        requestId: pending.requestId,
        wsFrameId: id,
        sessionKey: pending.sessionKey,
        taskId: pending.taskId,
        data: { method: pending.method },
        error: { message: 'connection closed' },
      });
      pending.reject(new Error('connection closed'));
      this.pendingRequests.delete(id);
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      try {
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      } catch {
        // ws lib may throw when closing a CONNECTING socket before the HTTP upgrade completes
      }
      this.ws = null;
    }
    this.authenticated = false;
  }

  destroy(): void {
    this.destroyed = true;
    this.cleanup();
  }
}
