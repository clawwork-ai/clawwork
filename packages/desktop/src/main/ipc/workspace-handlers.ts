import { ipcMain, dialog, BrowserWindow } from 'electron';
import {
  getWorkspacePath,
  writeConfig,
  isWorkspaceConfigured,
  getDefaultWorkspacePath,
} from '../workspace/config.js';
import { initWorkspace } from '../workspace/init.js';
import { initDatabase } from '../db/index.js';

export function registerWorkspaceHandlers(): void {
  ipcMain.handle('workspace:is-configured', () => {
    return isWorkspaceConfigured();
  });

  ipcMain.handle('workspace:get-path', () => {
    return getWorkspacePath();
  });

  ipcMain.handle('workspace:get-default', () => {
    return getDefaultWorkspacePath();
  });

  ipcMain.handle('workspace:browse', async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Workspace Directory',
      defaultPath: getDefaultWorkspacePath(),
    });

    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('workspace:setup', async (_event, workspacePath: string) => {
    try {
      await initWorkspace(workspacePath);
      initDatabase(workspacePath);
      writeConfig({ workspacePath, gateways: [] });
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'setup failed';
      return { ok: false, error: msg };
    }
  });
}
