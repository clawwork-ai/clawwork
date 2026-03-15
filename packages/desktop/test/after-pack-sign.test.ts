import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { adHocSignApp } = require('../scripts/afterPack.cjs');

describe('adHocSignApp', () => {
  it('ad-hoc signs the packaged macOS app with entitlements', async () => {
    const execSync = vi.fn();

    await adHocSignApp(
      {
        electronPlatformName: 'darwin',
        appOutDir: '/tmp/dist/mac-universal',
        packager: { appInfo: { productFilename: 'ClawWork' } },
      },
      execSync,
    );

    expect(execSync).toHaveBeenCalledTimes(1);
    const [command, options] = execSync.mock.calls[0];
    expect(command).toContain('codesign --sign - --force --deep');
    expect(command).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app'));
    expect(command).toContain(path.join('/Users/x/git/samzong/clawwork/packages/desktop/build', 'entitlements.mac.plist'));
    expect(options).toEqual({ stdio: 'inherit' });
  });

  it('skips temporary per-arch outputs during universal packaging', async () => {
    const execSync = vi.fn();

    await adHocSignApp(
      {
        electronPlatformName: 'darwin',
        appOutDir: '/tmp/dist/mac-universal-arm64-temp',
        packager: { appInfo: { productFilename: 'ClawWork' } },
      },
      execSync,
    );

    expect(execSync).not.toHaveBeenCalled();
  });

  it('skips non-mac builds', async () => {
    const execSync = vi.fn();

    await adHocSignApp(
      {
        electronPlatformName: 'win32',
        appOutDir: '/tmp/dist/win-unpacked',
        packager: { appInfo: { productFilename: 'ClawWork' } },
      },
      execSync,
    );

    expect(execSync).not.toHaveBeenCalled();
  });
});
