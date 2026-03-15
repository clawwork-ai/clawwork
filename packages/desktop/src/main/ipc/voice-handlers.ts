import { ipcMain, session, systemPreferences } from 'electron';
import { execFile } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, homedir } from 'os';
import { randomUUID } from 'crypto';

export type VoicePermissionStatus = 'granted' | 'not-determined' | 'denied' | 'unsupported';

interface MediaPermissionDetails {
  mediaType?: string;
  mediaTypes?: string[];
}

interface WhisperCheckResult {
  available: boolean;
  binaryPath: string | null;
  modelPath: string | null;
  error?: string;
}

interface WhisperTranscribeResult {
  ok: boolean;
  transcript?: string;
  error?: string;
}

const WHISPER_BINARY_CANDIDATES = [
  '/opt/homebrew/bin/whisper-cli',
  '/usr/local/bin/whisper-cli',
  '/opt/homebrew/bin/whisper-cpp',
  '/usr/local/bin/whisper-cpp',
];

const WHISPER_MODEL_DIRS = [
  join(homedir(), 'models', 'whisper'),
  '/opt/homebrew/share/whisper-cpp/models',
  join(homedir(), '.local', 'share', 'whisper-cpp', 'models'),
];

const WHISPER_MODEL_NAMES = [
  'ggml-large-v3-turbo.bin',
  'ggml-large-v3.bin',
  'ggml-large.bin',
  'ggml-medium.bin',
  'ggml-base.bin',
  'ggml-small.bin',
  'ggml-tiny.bin',
];

let cachedBinary: string | null | undefined;
let cachedModel: string | null | undefined;

function findWhisperBinary(): string | null {
  if (cachedBinary !== undefined) return cachedBinary;
  for (const candidate of WHISPER_BINARY_CANDIDATES) {
    if (existsSync(candidate)) {
      cachedBinary = candidate;
      return candidate;
    }
  }
  cachedBinary = null;
  return null;
}

function findWhisperModel(): string | null {
  if (cachedModel !== undefined) return cachedModel;
  for (const dir of WHISPER_MODEL_DIRS) {
    for (const name of WHISPER_MODEL_NAMES) {
      const fullPath = join(dir, name);
      if (existsSync(fullPath)) {
        cachedModel = fullPath;
        return fullPath;
      }
    }
  }
  cachedModel = null;
  return null;
}

function whisperTranscribe(binaryPath: string, modelPath: string, audioPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      ['-m', modelPath, '-f', audioPath, '--no-timestamps', '-l', 'auto'],
      { timeout: 60_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        const transcript = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join(' ')
          .trim();
        resolve(transcript);
      },
    );
  });
}

export function registerVoiceHandlers(): void {
  ipcMain.handle('voice:get-microphone-permission', () => {
    return { status: getMicrophonePermissionStatus() };
  });

  ipcMain.handle('voice:request-microphone-permission', async () => {
    return { status: await requestMicrophonePermission() };
  });

  ipcMain.handle('voice:check-whisper', (): WhisperCheckResult => {
    const binaryPath = findWhisperBinary();
    if (!binaryPath) {
      return { available: false, binaryPath: null, modelPath: null, error: 'whisper-cpp not found' };
    }
    const modelPath = findWhisperModel();
    if (!modelPath) {
      return { available: false, binaryPath, modelPath: null, error: 'no whisper model found' };
    }
    return { available: true, binaryPath, modelPath };
  });

  ipcMain.handle('voice:transcribe', async (_event, args: { audio: ArrayBuffer }): Promise<WhisperTranscribeResult> => {
    const binaryPath = findWhisperBinary();
    const modelPath = findWhisperModel();
    if (!binaryPath || !modelPath) {
      return { ok: false, error: 'whisper-cpp or model not found' };
    }

    const tempPath = join(tmpdir(), `clawwork-voice-${randomUUID()}.wav`);
    try {
      writeFileSync(tempPath, Buffer.from(args.audio));
      const transcript = await whisperTranscribe(binaryPath, modelPath, tempPath);
      return { ok: true, transcript };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      try { unlinkSync(tempPath); } catch {}
    }
  });
}

export function configureVoicePermissionHandlers(): void {
  const defaultSession = session.defaultSession;
  if (!defaultSession) return;

  defaultSession.setPermissionCheckHandler((_webContents, permission, _requestingOrigin, details) => {
    if (permission !== 'media') return false;
    return allowsAudioMedia(details as MediaPermissionDetails);
  });

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if (permission !== 'media') {
      callback(false);
      return;
    }
    callback(allowsAudioMedia(details as MediaPermissionDetails));
  });
}

function getMicrophonePermissionStatus(): VoicePermissionStatus {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    return normalizeMediaAccessStatus(systemPreferences.getMediaAccessStatus('microphone'));
  }
  return 'granted';
}

async function requestMicrophonePermission(): Promise<VoicePermissionStatus> {
  if (process.platform === 'darwin') {
    const granted = await systemPreferences.askForMediaAccess('microphone');
    return granted ? 'granted' : 'denied';
  }
  return getMicrophonePermissionStatus();
}

function normalizeMediaAccessStatus(status: string): VoicePermissionStatus {
  if (status === 'granted') return 'granted';
  if (status === 'not-determined') return 'not-determined';
  return 'denied';
}

function allowsAudioMedia(details: MediaPermissionDetails | undefined): boolean {
  if (!details) return false;
  if (Array.isArray(details.mediaTypes) && details.mediaTypes.includes('audio')) {
    return true;
  }
  return details.mediaType === 'audio' || details.mediaType === 'unknown';
}
