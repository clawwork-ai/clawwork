import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron';
import { join } from 'path';
import { writeFileSync } from 'fs';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { initAllGateways, destroyAllGateways, rebindAllWindows } from './ws/index.js';
import { registerWsHandlers } from './ipc/ws-handlers.js';
import { registerArtifactHandlers } from './ipc/artifact-handlers.js';
import { registerWorkspaceHandlers } from './ipc/workspace-handlers.js';
import { registerSettingsHandlers } from './ipc/settings-handlers.js';
import { registerSearchHandlers } from './ipc/search-handlers.js';
import { registerDataHandlers } from './ipc/data-handlers.js';
import { getWorkspacePath, readConfig } from './workspace/config.js';
import { initDatabase, closeDatabase } from './db/index.js';

const SCREENSHOT_PATH = '/tmp/clawwork-screenshot.png';

async function captureScreenshot(win: BrowserWindow): Promise<string> {
  const image = await win.webContents.capturePage();
  writeFileSync(SCREENSHOT_PATH, image.toPNG());
  console.log(`[screenshot] saved to ${SCREENSHOT_PATH}`);
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

  const wsPath = getWorkspacePath();
  if (wsPath) {
    try { initDatabase(wsPath); } catch (e) { console.error('[startup] DB init failed:', e); }
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
  globalShortcut.unregisterAll();
  destroyAllGateways();
  closeDatabase();
});
