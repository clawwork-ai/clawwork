import { BrowserWindow, ipcMain } from 'electron';
import { readConfig, updateConfig, writeConfig, buildGatewayAuth } from '../workspace/config.js';
import type { AppConfig, GatewayServerConfig } from '../workspace/config.js';
import { getGatewayClient, getAllGatewayClients, addGateway, removeGateway } from '../ws/index.js';
import { GatewayClient } from '../ws/gateway-client.js';
import type { GatewayAuth } from '@clawwork/shared';

function getMainWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows();
  return wins.length > 0 ? wins[0] : null;
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:get', (): AppConfig | null => {
    return readConfig();
  });

  ipcMain.handle(
    'settings:update',
    (_event, partial: Partial<AppConfig>): { ok: boolean; config: AppConfig } => {
      // Strip gateway fields — must use dedicated gateway handlers
      const { gateways: _g, defaultGatewayId: _d, ...safePartial } = partial;
      const config = updateConfig(safePartial);
      return { ok: true, config };
    },
  );

  ipcMain.handle('settings:add-gateway', async (_event, gateway: GatewayServerConfig) => {
    const config = readConfig() ?? { workspacePath: '', gateways: [] };
    config.gateways.push(gateway);
    if (gateway.isDefault || config.gateways.length === 1) {
      config.defaultGatewayId = gateway.id;
    }
    writeConfig(config);
    const mainWindow = getMainWindow();
    if (mainWindow) {
      addGateway({ id: gateway.id, name: gateway.name, url: gateway.url, auth: buildGatewayAuth(gateway) }, mainWindow);
    }
    return { ok: true };
  });

  ipcMain.handle('settings:remove-gateway', async (_event, gatewayId: string) => {
    const config = readConfig();
    if (!config) return { ok: false, error: 'no config' };
    config.gateways = config.gateways.filter(g => g.id !== gatewayId);
    if (config.defaultGatewayId === gatewayId) {
      config.defaultGatewayId = config.gateways[0]?.id;
    }
    writeConfig(config);
    removeGateway(gatewayId);
    return { ok: true };
  });

  ipcMain.handle('settings:update-gateway', async (_event, gatewayId: string, partial: Partial<GatewayServerConfig>) => {
    const config = readConfig();
    if (!config) return { ok: false, error: 'no config' };
    const idx = config.gateways.findIndex(g => g.id === gatewayId);
    if (idx === -1) return { ok: false, error: 'gateway not found' };
    config.gateways[idx] = { ...config.gateways[idx], ...partial };
    writeConfig(config);
    const client = getGatewayClient(gatewayId);
    if (client) {
      const gw = config.gateways[idx];
      client.updateConfig({ url: gw.url, auth: buildGatewayAuth(gw) });
    }
    return { ok: true, gateway: config.gateways[idx] };
  });

  ipcMain.handle('settings:set-default-gateway', async (_event, gatewayId: string) => {
    const config = readConfig();
    if (!config) return { ok: false, error: 'no config' };
    for (const gw of config.gateways) {
      gw.isDefault = gw.id === gatewayId;
    }
    config.defaultGatewayId = gatewayId;
    writeConfig(config);
    return { ok: true };
  });

  ipcMain.handle('settings:test-gateway', async (_event, url: string, auth: { token?: string; password?: string }) => {
    const testAuth: GatewayAuth = auth.token ? { token: auth.token } : auth.password ? { password: auth.password } : { token: '' };
    const testClient = new GatewayClient(
      { id: `test-${Date.now()}`, name: 'test', url, auth: testAuth },
      { noReconnect: true },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          testClient.destroy();
          reject(new Error('timeout'));
        }, 10000);
        // Poll — isConnected flips to true after auth handshake completes
        const checkInterval = setInterval(() => {
          if (testClient.isConnected) {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            resolve();
          }
        }, 300);
      });
      testClient.destroy();
      return { ok: true };
    } catch (e) {
      testClient.destroy();
      return { ok: false, error: e instanceof Error ? e.message : 'connection failed' };
    }
  });
}
