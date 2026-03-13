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
  private wsUrl: string;
  private auth: GatewayAuth;

  constructor(config: GatewayClientConfig) {
    this.wsUrl = config.url;
    this.auth = config.auth;
  }

  updateConfig(url: string, auth?: GatewayAuth): void {
    this.wsUrl = url;
    if (auth) this.auth = auth;
    this.reconnectAttempts = 0;
    this.connect();
  }

  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  connect(): void {
    if (this.destroyed) return;
    this.cleanup();

    console.log(`[gateway] connecting to ${this.wsUrl}`);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.on('open', () => {
      console.log('[gateway] ws open, waiting for challenge...');
    });

    this.ws.on('message', (raw) => {
      this.handleRaw(raw.toString());
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[gateway] closed: ${code} ${reason}`);
      this.authenticated = false;
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error(`[gateway] ws error: ${err.message}`);
    });
  }

  private handleRaw(raw: string): void {
    let frame: GatewayFrame;
    try {
      frame = JSON.parse(raw) as GatewayFrame;
    } catch {
      console.error('[gateway] invalid JSON frame');
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
      this.handleChallenge();
      return;
    }

    if (frame.event === 'tick') {
      return;
    }

    sendToWindow(this.mainWindow, 'gateway-event', {
      event: frame.event,
      payload: frame.payload,
      seq: frame.seq,
    });
  }

  private handleChallenge(): void {
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
      auth: this.auth,
      role: 'operator',
      scopes: ['operator.admin', 'operator.approvals', 'operator.pairing'],
    };

    this.sendReq('connect', params as unknown as Record<string, unknown>)
      .then((payload) => {
        const pType = payload['type'] as string | undefined;
        if (pType === 'hello-ok') {
          console.log('[gateway] authenticated');
          this.authenticated = true;
          this.reconnectAttempts = 0;
          this.startHeartbeat();
          sendToWindow(this.mainWindow, 'gateway-status', { connected: true });
        } else {
          console.error('[gateway] unexpected connect response:', payload);
        }
      })
      .catch((err: Error) => {
        console.error('[gateway] connect handshake failed:', err.message);
        this.ws?.close();
      });
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

  get isConnected(): boolean {
    return this.authenticated && this.ws?.readyState === WebSocket.OPEN;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.sendReq('health', {}).catch(() => {
          console.warn('[gateway] heartbeat failed');
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
    if (this.destroyed) return;
    if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error('[gateway] max reconnect attempts reached');
      sendToWindow(this.mainWindow, 'gateway-status', {
        connected: false,
        error: 'max reconnect attempts',
      });
      return;
    }

    const delay = RECONNECT_DELAY_MS * Math.pow(2, Math.min(this.reconnectAttempts, 5));
    this.reconnectAttempts++;
    console.log(`[gateway] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private cleanup(): void {
    this.stopHeartbeat();
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
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
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
