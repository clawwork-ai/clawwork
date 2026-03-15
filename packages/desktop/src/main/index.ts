import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { initAllGateways, destroyAllGateways, rebindAllWindows } from './ws/index.js';
import { initDebugLogger, getDebugLogger } from './debug/index.js';
import { registerWsHandlers } from './ipc/ws-handlers.js';
import { registerArtifactHandlers } from './ipc/artifact-handlers.js';
import { registerWorkspaceHandlers } from './ipc/workspace-handlers.js';
import { registerSettingsHandlers } from './ipc/settings-handlers.js';
import { registerSearchHandlers } from './ipc/search-handlers.js';
import { registerDataHandlers } from './ipc/data-handlers.js';
import { registerUpdateHandlers } from './ipc/update-handlers.js';
import { registerDebugHandlers } from './ipc/debug-handlers.js';
import { configureVoicePermissionHandlers, registerVoiceHandlers } from './ipc/voice-handlers.js';
import { getWorkspacePath, readConfig } from './workspace/config.js';
import { initDatabase, closeDatabase } from './db/index.js';

// Prevent EPIPE crashes when stdout/stderr pipe is broken (common in dev mode)
process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});

const SCREENSHOT_PATH = '/tmp/clawwork-screenshot.png';

async function captureScreenshot(win: BrowserWindow): Promise<string> {
  const image = await win.webContents.capturePage();
  writeFileSync(SCREENSHOT_PATH, image.toPNG());
  getDebugLogger().info({
    domain: 'app',
    event: 'app.screenshot.saved',
    data: { path: SCREENSHOT_PATH },
  });
  return SCREENSHOT_PATH;
}

function setupDevScreenshot(win: BrowserWindow): void {
  if (!is.dev) return;

  // Capture initial screenshot after page loads
  win.webContents.on('did-finish-load', () => {
    setTimeout(() => captureScreenshot(win), 1500);
  });

  // Global shortcut: Cmd+Shift+S to capture
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    captureScreenshot(win);
  });

  // IPC handler so renderer or scripts can trigger it
  ipcMain.handle('dev:screenshot', () => captureScreenshot(win));
}

function createWindow(): BrowserWindow {
  getDebugLogger().info({ domain: 'app', event: 'app.window.create' });
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: readConfig()?.theme === 'light' ? '#FAFAFA' : '#1C1C1C',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  initDebugLogger(join(app.getPath('userData'), 'debug'));
  getDebugLogger().info({ domain: 'app', event: 'app.start', data: { userData: app.getPath('userData') } });
  electronApp.setAppUserModelId('com.clawwork.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  registerWsHandlers();
  registerArtifactHandlers();
  registerWorkspaceHandlers();
  registerSettingsHandlers();
  registerSearchHandlers();
  registerDataHandlers();
  registerUpdateHandlers();
  registerDebugHandlers();
  registerVoiceHandlers();
  configureVoicePermissionHandlers();

  const wsPath = getWorkspacePath();
  if (wsPath) {
    getDebugLogger().info({ domain: 'workspace', event: 'workspace.detected', data: { workspacePath: wsPath } });
    try {
      getDebugLogger().info({ domain: 'db', event: 'db.init.start', data: { workspacePath: wsPath } });
      initDatabase(wsPath);
      getDebugLogger().info({ domain: 'db', event: 'db.init.ok', data: { workspacePath: wsPath } });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      getDebugLogger().error({
        domain: 'db',
        event: 'db.init.failed',
        data: { workspacePath: wsPath },
        error: { name: err.name, message: err.message, stack: err.stack },
      });
    }
  }

  const mainWindow = createWindow();
  initAllGateways(mainWindow);
  setupDevScreenshot(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const win = createWindow();
      rebindAllWindows(win);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  getDebugLogger().info({ domain: 'app', event: 'app.before-quit' });
  globalShortcut.unregisterAll();
  destroyAllGateways();
  closeDatabase();
});
