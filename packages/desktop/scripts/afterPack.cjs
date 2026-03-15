const { execSync } = require('child_process');
const path = require('node:path');

async function adHocSignApp(context, run = execSync) {
  if (context.electronPlatformName !== 'darwin') return;
  if (context.appOutDir.endsWith('-temp')) return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  const entitlements = path.join(__dirname, '..', 'build', 'entitlements.mac.plist');

  run(
    `codesign --sign - --force --deep --entitlements "${entitlements}" "${appPath}"`,
    { stdio: 'inherit' },
  );
}

exports.adHocSignApp = adHocSignApp;
exports.default = adHocSignApp;
