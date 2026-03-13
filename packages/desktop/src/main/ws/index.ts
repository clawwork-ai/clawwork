import type { BrowserWindow } from 'electron';
import type { GatewayClientConfig } from '@clawwork/shared';
import { GatewayClient } from './gateway-client.js';
import { readConfig, buildGatewayAuth } from '../workspace/config.js';

const gatewayClients = new Map<string, GatewayClient>();

export function initAllGateways(mainWindow: BrowserWindow): void {
  const config = readConfig();
  const gateways = config?.gateways ?? [];
  for (const gw of gateways) {
    const client = new GatewayClient({ id: gw.id, name: gw.name, url: gw.url, auth: buildGatewayAuth(gw) });
    client.setMainWindow(mainWindow);
    client.connect();
    gatewayClients.set(gw.id, client);
  }
}

export function getGatewayClient(gatewayId: string): GatewayClient | null {
  return gatewayClients.get(gatewayId) ?? null;
}

export function getAllGatewayClients(): Map<string, GatewayClient> {
  return gatewayClients;
}

export function addGateway(config: GatewayClientConfig, mainWindow: BrowserWindow): GatewayClient {
  const client = new GatewayClient(config);
  client.setMainWindow(mainWindow);
  client.connect();
  gatewayClients.set(config.id, client);
  return client;
}

export function removeGateway(gatewayId: string): void {
  const client = gatewayClients.get(gatewayId);
  if (client) {
    client.destroy();
    gatewayClients.delete(gatewayId);
  }
}

export function rebindAllWindows(mainWindow: BrowserWindow): void {
  for (const client of gatewayClients.values()) {
    client.setMainWindow(mainWindow);
  }
}

export function destroyAllGateways(): void {
  for (const client of gatewayClients.values()) {
    client.destroy();
  }
  gatewayClients.clear();
}
