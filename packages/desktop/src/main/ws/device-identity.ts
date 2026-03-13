import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

interface StoredIdentity {
  version: 1;
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  createdAtMs: number;
}

export interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: 'spki', format: 'der' });
  if (
    spki.length === ED25519_SPKI_PREFIX.length + 32 &&
    spki.subarray(0, ED25519_SPKI_PREFIX.length).equals(ED25519_SPKI_PREFIX)
  ) {
    return spki.subarray(ED25519_SPKI_PREFIX.length);
  }
  return spki;
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem);
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function generateIdentity(): DeviceIdentity {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  return {
    deviceId: fingerprintPublicKey(publicKeyPem),
    publicKeyPem,
    privateKeyPem,
  };
}

function resolveDefaultIdentityPath(): string {
  return path.join(app.getPath('userData'), 'device-identity.json');
}

export function loadOrCreateDeviceIdentity(filePath?: string): DeviceIdentity {
  const resolved = filePath ?? resolveDefaultIdentityPath();
  try {
    if (fs.existsSync(resolved)) {
      const raw = fs.readFileSync(resolved, 'utf8');
      const parsed = JSON.parse(raw) as StoredIdentity;
      if (
        parsed?.version === 1 &&
        typeof parsed.deviceId === 'string' &&
        typeof parsed.publicKeyPem === 'string' &&
        typeof parsed.privateKeyPem === 'string'
      ) {
        const derivedId = fingerprintPublicKey(parsed.publicKeyPem);
        if (derivedId && derivedId !== parsed.deviceId) {
          const updated: StoredIdentity = { ...parsed, deviceId: derivedId };
          fs.writeFileSync(resolved, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
          return { deviceId: derivedId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem };
        }
        return { deviceId: parsed.deviceId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem };
      }
    }
  } catch {
    // fall through to generate new identity
  }
  const identity = generateIdentity();
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const stored: StoredIdentity = {
    version: 1,
    deviceId: identity.deviceId,
    publicKeyPem: identity.publicKeyPem,
    privateKeyPem: identity.privateKeyPem,
    createdAtMs: Date.now(),
  };
  fs.writeFileSync(resolved, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  return identity;
}

export function publicKeyRawBase64Url(publicKeyPem: string): string {
  return base64UrlEncode(derivePublicKeyRaw(publicKeyPem));
}

export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(Buffer.from(crypto.sign(null, Buffer.from(payload, 'utf8'), key)));
}

interface DeviceAuthPayloadV3Params {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
  platform: string | null;
  deviceFamily: string | null;
}

function normalizeMetadataForAuth(value: string | null | undefined): string {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

export function buildDeviceAuthPayloadV3(params: DeviceAuthPayloadV3Params): string {
  const scopes = params.scopes.join(',');
  const token = params.token ?? '';
  const platform = normalizeMetadataForAuth(params.platform);
  const deviceFamily = normalizeMetadataForAuth(params.deviceFamily);
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token,
    params.nonce,
    platform,
    deviceFamily,
  ].join('|');
}

export interface DeviceConnectPayload {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
}

export function buildDeviceConnectPayload(
  identity: DeviceIdentity,
  params: {
    clientId: string;
    clientMode: string;
    role: string;
    scopes: string[];
    nonce: string;
    token: string | null;
    platform: string | null;
    deviceFamily: string | null;
  },
): DeviceConnectPayload {
  const signedAtMs = Date.now();
  const payload = buildDeviceAuthPayloadV3({
    deviceId: identity.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: params.role,
    scopes: params.scopes,
    signedAtMs,
    token: params.token,
    nonce: params.nonce,
    platform: params.platform,
    deviceFamily: params.deviceFamily,
  });
  const signature = signDevicePayload(identity.privateKeyPem, payload);
  return {
    id: identity.deviceId,
    publicKey: publicKeyRawBase64Url(identity.publicKeyPem),
    signature,
    signedAt: signedAtMs,
    nonce: params.nonce,
  };
}

// --- Device token persistence (per-gateway) ---

interface DeviceTokenStore {
  version: 1;
  tokens: Record<string, { token: string; role: string; issuedAtMs: number }>;
}

function resolveDeviceTokenStorePath(): string {
  return path.join(app.getPath('userData'), 'device-tokens.json');
}

function readTokenStore(): DeviceTokenStore {
  const storePath = resolveDeviceTokenStorePath();
  try {
    if (fs.existsSync(storePath)) {
      const parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as DeviceTokenStore;
      if (parsed?.version === 1 && parsed.tokens && typeof parsed.tokens === 'object') {
        return parsed;
      }
    }
  } catch {
    // corrupt file — start fresh
  }
  return { version: 1, tokens: {} };
}

function writeTokenStore(store: DeviceTokenStore): void {
  const storePath = resolveDeviceTokenStorePath();
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
}

export function saveDeviceToken(
  gatewayId: string,
  token: string,
  role: string,
  issuedAtMs: number,
): void {
  const store = readTokenStore();
  store.tokens[gatewayId] = { token, role, issuedAtMs };
  writeTokenStore(store);
}

export function loadDeviceToken(gatewayId: string): string | null {
  const store = readTokenStore();
  return store.tokens[gatewayId]?.token ?? null;
}

export function removeDeviceToken(gatewayId: string): void {
  const store = readTokenStore();
  if (gatewayId in store.tokens) {
    delete store.tokens[gatewayId];
    writeTokenStore(store);
  }
}
