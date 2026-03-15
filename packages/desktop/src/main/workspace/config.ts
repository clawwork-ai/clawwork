import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { randomUUID } from 'node:crypto';
import { CONFIG_FILE_NAME, DEFAULT_WORKSPACE_DIR } from '@clawwork/shared';

export interface GatewayServerConfig {
  id: string;
  name: string;
  url: string;
  token?: string;
  password?: string;
  isDefault?: boolean;
  color?: string;
}

export interface VoiceInputConfig {
  introSeen?: boolean;
}

export interface AppConfig {
  workspacePath: string;
  theme?: 'dark' | 'light';
  language?: 'en' | 'zh';
  gateways: GatewayServerConfig[];
  defaultGatewayId?: string;
  sendShortcut?: 'enter' | 'cmdEnter';
  gatewayUrl?: string;
  bootstrapToken?: string;
  password?: string;
  tlsFingerprint?: string;
  voiceInput?: VoiceInputConfig;
}

function configFilePath(): string {
  return join(app.getPath('userData'), CONFIG_FILE_NAME);
}

export function getDefaultWorkspacePath(): string {
  return join(homedir(), DEFAULT_WORKSPACE_DIR);
}

/** Migrate legacy single-gateway config to multi-gateway format */
function migrateConfigIfNeeded(config: AppConfig): AppConfig {
  if (config.gatewayUrl && (!config.gateways || config.gateways.length === 0)) {
    const id = randomUUID();
    const token = config.bootstrapToken || process.env.OPENCLAW_GATEWAY_TOKEN;
    const migrated: AppConfig = {
      workspacePath: config.workspacePath,
      theme: config.theme,
      language: config.language,
      voiceInput: config.voiceInput,
      gateways: [
        {
          id,
          name: 'Default Gateway',
          url: config.gatewayUrl,
          token,
          password: config.password,
          isDefault: true,
        },
      ],
      defaultGatewayId: id,
    };
    writeConfig(migrated);
    return migrated;
  }
  // Ensure gateways array always exists
  if (!config.gateways) {
    config.gateways = [];
  }
  return config;
}

export function readConfig(): AppConfig | null {
  const cfgPath = configFilePath();
  if (!existsSync(cfgPath)) return null;
  try {
    const raw = readFileSync(cfgPath, 'utf-8');
    const config = JSON.parse(raw) as AppConfig;
    return migrateConfigIfNeeded(config);
  } catch {
    return null;
  }
}

export function writeConfig(config: AppConfig): void {
  const cfgPath = configFilePath();
  writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf-8');
}

export function updateConfig(partial: Partial<AppConfig>): AppConfig {
  const current = readConfig() ?? { workspacePath: getDefaultWorkspacePath(), gateways: [] };
  const merged = { ...current, ...partial };
  writeConfig(merged);
  return merged;
}

export function getWorkspacePath(): string | null {
  return readConfig()?.workspacePath ?? null;
}

export function isWorkspaceConfigured(): boolean {
  return getWorkspacePath() !== null;
}

/** Build GatewayAuth from a persisted GatewayServerConfig */
export function buildGatewayAuth(gw: GatewayServerConfig): { token: string } | { password: string } {
  if (gw.token) return { token: gw.token };
  if (gw.password) return { password: gw.password };
  const envToken = process.env.OPENCLAW_GATEWAY_TOKEN;
  if (envToken) return { token: envToken };
  return { token: '' };
}
