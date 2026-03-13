// ============================================================
// Gateway WebSocket Protocol Types
// JSON-RPC inspired frames: req, res, event
// ============================================================

export interface GatewayReqFrame {
  type: 'req';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export interface GatewayResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: Record<string, unknown>;
  error?: { code: string; message: string };
}

export interface GatewayEventFrame {
  type: 'event';
  event: string;
  seq?: number;
  payload: Record<string, unknown>;
}

export type GatewayFrame =
  | GatewayReqFrame
  | GatewayResFrame
  | GatewayEventFrame;

export type GatewayAuth =
  | { token: string; deviceToken?: string }
  | { password: string; deviceToken?: string };

export interface GatewayConnectParams {
  minProtocol: 3;
  maxProtocol: 3;
  client: {
    id: string;
    displayName: string;
    version: string;
    platform: string;
    mode: 'backend';
    deviceFamily?: string;
  };
  caps: string[];
  auth: GatewayAuth;
  role: 'operator';
  scopes: string[];
  device?: {
    id: string;
    publicKey: string;
    signature: string;
    signedAt: number;
    nonce: string;
  };
}

export interface GatewayClientConfig {
  id: string;
  name: string;
  url: string;
  auth: GatewayAuth;
}
