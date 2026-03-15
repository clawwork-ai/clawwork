import { describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { adHocSignApp } = require('../scripts/afterPack.cjs');
const testDir = path.dirname(fileURLToPath(import.meta.url));

describe('adHocSignApp', () => {
  it('signs nested frameworks and helper apps before the packaged macOS app', async () => {
    const execSync = vi.fn();
    const exists = vi.fn(() => true);

    await adHocSignApp(
      {
        electronPlatformName: 'darwin',
        appOutDir: '/tmp/dist/mac-universal',
        packager: { appInfo: { productFilename: 'ClawWork' } },
      },
      execSync,
      exists,
    );

    expect(execSync).toHaveBeenCalledTimes(14);

    const commands = execSync.mock.calls.map(([command]) => command);
    expect(commands[0]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libEGL.dylib'));
    expect(commands[1]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib'));
    expect(commands[2]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib'));
    expect(commands[3]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib'));
    expect(commands[4]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler'));
    expect(commands[5]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/Electron Framework.framework'));
    expect(commands[6]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/Mantle.framework'));
    expect(commands[7]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/ReactiveObjC.framework'));
    expect(commands[8]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/Squirrel.framework'));
    expect(commands[9]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/ClawWork Helper.app'));
    expect(commands[10]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/ClawWork Helper (GPU).app'));
    expect(commands[11]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/ClawWork Helper (Plugin).app'));
    expect(commands[12]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app/Contents/Frameworks/ClawWork Helper (Renderer).app'));
    expect(commands[13]).toContain(path.join('/tmp/dist/mac-universal', 'ClawWork.app'));

    for (const command of commands) {
      expect(command).toContain('codesign --sign - --force');
      expect(command).not.toContain('--deep');
    }

    expect(commands[13]).toContain(path.resolve(testDir, '../build/entitlements.mac.plist'));

    for (const [, options] of execSync.mock.calls) {
      expect(options).toEqual({ stdio: 'inherit' });
    }
  });

  it('skips temporary per-arch outputs during universal packaging', async () => {
    const execSync = vi.fn();
    const exists = vi.fn(() => true);

    await adHocSignApp(
      {
        electronPlatformName: 'darwin',
        appOutDir: '/tmp/dist/mac-universal-arm64-temp',
        packager: { appInfo: { productFilename: 'ClawWork' } },
      },
      execSync,
      exists,
    );

    expect(execSync).not.toHaveBeenCalled();
  });

  it('skips non-mac builds', async () => {
    const execSync = vi.fn();
    const exists = vi.fn(() => true);

    await adHocSignApp(
      {
        electronPlatformName: 'win32',
        appOutDir: '/tmp/dist/win-unpacked',
        packager: { appInfo: { productFilename: 'ClawWork' } },
      },
      execSync,
      exists,
    );

    expect(execSync).not.toHaveBeenCalled();
  });
});
