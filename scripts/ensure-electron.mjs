/**
 * Ensures the Electron binary is installed.
 *
 * pnpm's content-addressable store doesn't include postinstall artifacts
 * (the Electron binary lives in dist/). New worktrees or fresh clones may
 * have the electron package linked but the binary missing.
 *
 * This runs as a root postinstall hook — if the binary is already present,
 * it's a no-op (~2ms).
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';

// electron is a dependency of @clawwork/desktop, not hoisted to root
const electronDir = resolve('packages/desktop/node_modules/electron');

if (!existsSync(electronDir)) {
  // electron package not installed at all — pnpm install will handle it
  process.exit(0);
}

const pathTxt = resolve(electronDir, 'path.txt');

if (existsSync(pathTxt)) {
  // Binary already present, nothing to do
  process.exit(0);
}

// Binary missing — run electron's own install script
const installScript = resolve(electronDir, 'install.js');
console.log('[postinstall] Electron binary missing, installing...');
execFileSync(process.execPath, [installScript], {
  stdio: 'inherit',
  cwd: electronDir,
});
console.log('[postinstall] Electron binary installed.');
