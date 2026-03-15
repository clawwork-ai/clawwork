import { app, ipcMain } from 'electron';
import { join } from 'node:path';
import { exportDebugBundle } from '../debug/export.js';
import { getDebugLogger } from '../debug/index.js';
import { getAllGatewayClients } from '../ws/index.js';
import { readConfig } from '../workspace/config.js';

export function registerDebugHandlers(): void {
  ipcMain.on('debug:renderer-event', (_event, payload: {
    domain: string;
    event: string;
    traceId?: string;
    feature?: string;
    data?: Record<string, unknown>;
  }) => {
    const logger = getDebugLogger();
    logger.info({
      domain: (payload.domain || 'renderer') as 'renderer',
      event: payload.event,
      traceId: payload.traceId,
      feature: payload.feature,
      data: payload.data,
    });
  });

  ipcMain.handle('debug:export-bundle', async (_event, payload?: {
    gatewayId?: string;
    sessionKey?: string;
    taskId?: string;
    limit?: number;
  }) => {
    const clients = getAllGatewayClients();
    const gatewayStatus: Record<string, { connected: boolean; name: string }> = {};
    for (const [id, client] of clients) {
      gatewayStatus[id] = { connected: client.isConnected, name: client.name };
    }

    const result = exportDebugBundle({
      outputDir: join(app.getPath('userData'), 'debug-bundles'),
      logger: getDebugLogger(),
      meta: {
        gatewayStatus,
        config: readConfig() as unknown as Record<string, unknown> | undefined,
        environment: {
          platform: process.platform,
          arch: process.arch,
          node: process.version,
          electron: process.versions.electron,
        },
      },
      filter: payload,
    });

    return { ok: true, path: result.bundlePath, eventCount: result.events.length };
  });
}
