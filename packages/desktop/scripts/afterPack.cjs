const { execSync } = require('child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');

function sign(run, targetPath, entitlements) {
  const entitlementsArg = entitlements ? ` --entitlements "${entitlements}"` : '';
  run(`codesign --sign - --force${entitlementsArg} "${targetPath}"`, {
    stdio: 'inherit',
  });
}

async function adHocSignApp(context, run = execSync, exists = existsSync) {
  if (context.electronPlatformName !== 'darwin') return;
  if (context.appOutDir.endsWith('-temp')) return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const frameworksDir = path.join(appPath, 'Contents', 'Frameworks');
  const entitlements = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');

  const nestedTargets = [
    'Electron Framework.framework/Versions/A/Libraries/libEGL.dylib',
    'Electron Framework.framework/Versions/A/Libraries/libGLESv2.dylib',
    'Electron Framework.framework/Versions/A/Libraries/libffmpeg.dylib',
    'Electron Framework.framework/Versions/A/Libraries/libvk_swiftshader.dylib',
    'Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler',
    'Electron Framework.framework',
    'Mantle.framework',
    'ReactiveObjC.framework',
    'Squirrel.framework',
    `${context.packager.appInfo.productFilename} Helper.app`,
    `${context.packager.appInfo.productFilename} Helper (GPU).app`,
    `${context.packager.appInfo.productFilename} Helper (Plugin).app`,
    `${context.packager.appInfo.productFilename} Helper (Renderer).app`,
  ].map((entry) => path.join(frameworksDir, entry));

  for (const targetPath of nestedTargets) {
    if (exists(targetPath)) {
      sign(run, targetPath);
    }
  }

  sign(run, appPath, entitlements);
}

exports.adHocSignApp = adHocSignApp;
exports.default = adHocSignApp;
