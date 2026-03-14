import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import {
  GATEWAY_WS_PORT,
  HEARTBEAT_INTERVAL_MS,
  RECONNECT_DELAY_MS,
  MAX_RECONNECT_ATTEMPTS,
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

type PendingReq = {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
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

    console.log(`[gateway:${this.gatewayId}] connecting to ${this.wsUrl}`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log(`[gateway:${this.gatewayId}] ws open, waiting for challenge...`);
    });

    this.ws.on('message', (raw) => {
      this.handleRaw(raw.toString());
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[gateway:${this.gatewayId}] closed: ${code} ${reason}`);
      this.authenticated = false;
      this.stopHeartbeat();
      if (this.mainWindow) {
        sendToWindow(this.mainWindow, 'gateway-status', {
          gatewayId: this.gatewayId,
          connected: false,
        });
      }
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[gateway:${this.gatewayId}] ws error: ${err.message}`);
    });
  }

  private handleRaw(raw: string): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(raw) as GatewayFrame;
    } catch {
      console.error(`[gateway:${this.gatewayId}] invalid JSON frame`);
      return;
    }

    switch (frame.type) {
      case 'event':
        this.handleEvent(frame);
        break;
      case 'res':
        this.handleResponse(frame);
        break;
      case 'req':
        break;
    }
  }

  private handleEvent(frame: { event: string; payload: Record<string, unknown>; seq?: number }): void {
    if (frame.event === 'connect.challenge') {
      const nonce =
        frame.payload && typeof frame.payload.nonce === 'string'
          ? frame.payload.nonce.trim()
          : '';
      if (!nonce) {
        console.error(`[gateway:${this.gatewayId}] connect challenge missing nonce`);
        this.ws?.close(1008, 'connect challenge missing nonce');
        return;
      }
      this.connectNonce = nonce;
      this.handleChallenge(nonce);
      return;
    }

    if (frame.event === 'tick') {
      return;
    }

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
        version: '0.1.0',
        platform: process.platform,
        mode: 'backend',
      },
      caps: ['tool-events'],
      auth: this.buildAuthWithDeviceToken(),
      role: 'operator',
      scopes,
      device,
    };

    this.sendReq('connect', params as unknown as Record<string, unknown>)
      .then((payload) => {
        const pType = payload['type'] as string | undefined;
        if (pType === 'hello-ok') {
          console.log(`[gateway:${this.gatewayId}] authenticated`);
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
          console.error(`[gateway:${this.gatewayId}] unexpected connect response:`, JSON.stringify(payload));
        }
      })
      .catch((err: Error) => {
        console.error(`[gateway:${this.gatewayId}] connect handshake failed:`, err.message, err);
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
    }
  }

  private handleResponse(frame: GatewayResFrame): void {
    const pending = this.pendingRequests.get(frame.id);
    if (!pending) return;
    this.pendingRequests.delete(frame.id);
    clearTimeout(pending.timer);

    if (frame.ok && frame.payload) {
      pending.resolve(frame.payload);
    } else {
      const errMsg = frame.error?.message ?? 'request failed';
      pending.reject(new Error(errMsg));
    }
  }

  sendReq(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('not connected'));
        return;
      }

      const id = randomUUID();
      const frame: GatewayReqFrame = { type: 'req', id, method, params };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`request timeout: ${method}`));
      }, REQ_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timer });
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
    return this.sendReq('chat.send', params);
  }

  async abortChat(sessionKey: string): Promise<Record<string, unknown>> {
    return this.sendReq('chat.abort', { sessionKey });
  }

  async getChatHistory(sessionKey: string, limit = 50): Promise<Record<string, unknown>> {
    return this.sendReq('chat.history', { sessionKey, limit });
  }

  async listSessions(): Promise<Record<string, unknown>> {
    return this.sendReq('sessions.list', {});
  }

  async listModels(): Promise<Record<string, unknown>> {
    return this.sendReq('models.list', {});
  }

  async patchSession(sessionKey: string, patch: { model?: string; thinkingLevel?: string }): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = { key: sessionKey };
    if (patch.model) payload.model = patch.model;
    if (patch.thinkingLevel) payload.thinkingLevel = patch.thinkingLevel;
    return this.sendReq('sessions.patch', payload);
  }

  get isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendReq('health', {}).catch(() => {
          console.warn(`[gateway:${this.gatewayId}] heartbeat failed`);
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
      console.error(`[gateway:${this.gatewayId}] max reconnect attempts reached`);
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
    console.log(`[gateway:${this.gatewayId}] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

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
