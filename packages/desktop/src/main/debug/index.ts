import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { DebugEvent } from '@clawwork/shared';
import type { DebugLogger } from './logger.js';
import { createDebugLogger } from './logger.js';

let debugLogger: DebugLogger = createDebugLogger({
  debugDir: join(process.cwd(), '.clawwork-debug'),
  console: true,
});

export function initDebugLogger(debugDir: string): DebugLogger {
  debugLogger = createDebugLogger({
    debugDir,
    console: true,
    onEvent: broadcastDebugEvent,
  });
  return debugLogger;
}

export function getDebugLogger(): DebugLogger {
  return debugLogger;
}

function broadcastDebugEvent(event: DebugEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      win.webContents.send('debug-event', event);
    } catch {
      // ignore broadcast failures for windows closing during dispatch
    }
  }
}
