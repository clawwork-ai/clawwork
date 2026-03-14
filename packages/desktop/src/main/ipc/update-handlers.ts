import { ipcMain, app, net } from 'electron';

interface ReleaseInfo {
  tag_name: string;
  html_url: string;
}

interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
}

let cachedResult: UpdateCheckResult | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function registerUpdateHandlers(): void {
  ipcMain.handle('app:check-for-updates', async (): Promise<UpdateCheckResult> => {
    const now = Date.now();
    if (cachedResult && now < cacheExpiresAt) {
      return cachedResult;
    }

    const currentVersion = app.getVersion();

    try {
      const resp = await net.fetch(
        'https://api.github.com/repos/clawwork-ai/clawwork/releases/latest',
        { headers: { 'User-Agent': `ClawWork/${currentVersion}` } },
      );

      if (!resp.ok) {
        return { currentVersion, latestVersion: currentVersion, hasUpdate: false, releaseUrl: '' };
      }

      const data = await resp.json() as ReleaseInfo;
      const latestVersion = data.tag_name.replace(/^v/, '');
      const releaseUrl = data.html_url;

      const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
      cachedResult = { currentVersion, latestVersion, hasUpdate, releaseUrl };
      cacheExpiresAt = now + CACHE_TTL_MS;
      return cachedResult;
    } catch {
      return { currentVersion, latestVersion: currentVersion, hasUpdate: false, releaseUrl: '' };
    }
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
