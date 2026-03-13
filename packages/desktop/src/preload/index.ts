import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';
import type { ClawWorkAPI } from './clawwork';

function buildApi(): ClawWorkAPI {
  return {
    sendMessage: (sessionKey: string, content: string, attachments?: { mimeType: string; fileName: string; content: string }[]) =>
      ipcRenderer.invoke('ws:send-message', { sessionKey, content, attachments }),
    chatHistory: (sessionKey: string, limit?: number) =>
      ipcRenderer.invoke('ws:chat-history', { sessionKey, limit }),
    listSessions: () =>
      ipcRenderer.invoke('ws:list-sessions'),
    gatewayStatus: () =>
      ipcRenderer.invoke('ws:gateway-status'),
    syncSessions: () =>
      ipcRenderer.invoke('ws:sync-sessions'),

    onGatewayEvent: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => {
        callback(data as { event: string; payload: Record<string, unknown> });
      };
      ipcRenderer.on('gateway-event', listener);
      return () => { ipcRenderer.removeListener('gateway-event', listener); };
    },
    onGatewayStatus: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, status: unknown): void => {
        callback(status as { connected: boolean; error?: string });
      };
      ipcRenderer.on('gateway-status', listener);
      return () => { ipcRenderer.removeListener('gateway-status', listener); };
    },

    loadTasks: () =>
      ipcRenderer.invoke('data:list-tasks'),
    loadMessages: (taskId: string) =>
      ipcRenderer.invoke('data:list-messages', { taskId }),

    saveArtifact: (params: {
      taskId: string;
      sourcePath: string;
      messageId: string;
      fileName?: string;
      mediaType?: string;
    }) => ipcRenderer.invoke('artifact:save', params),
    listArtifacts: (taskId?: string) =>
      ipcRenderer.invoke('artifact:list', { taskId }),
    getArtifact: (id: string) =>
      ipcRenderer.invoke('artifact:get', { id }),
    readArtifactFile: (localPath: string) =>
      ipcRenderer.invoke('artifact:read-file', { localPath }),
    onArtifactSaved: (callback: (artifact: unknown) => void) => {
      ipcRenderer.on('artifact:saved', (_event, artifact) => callback(artifact));
    },

    isWorkspaceConfigured: () =>
      ipcRenderer.invoke('workspace:is-configured') as Promise<boolean>,
    getWorkspacePath: () =>
      ipcRenderer.invoke('workspace:get-path') as Promise<string | null>,
    getDefaultWorkspacePath: () =>
      ipcRenderer.invoke('workspace:get-default') as Promise<string>,
    browseWorkspace: () =>
      ipcRenderer.invoke('workspace:browse') as Promise<string | null>,
    setupWorkspace: (path: string) =>
      ipcRenderer.invoke('workspace:setup', path),

    getSettings: () =>
      ipcRenderer.invoke('settings:get'),
    updateSettings: (partial: Record<string, unknown>) =>
      ipcRenderer.invoke('settings:update', partial),

    globalSearch: (query: string) =>
      ipcRenderer.invoke('search:global', query),

    persistTask: (task: {
      id: string; sessionKey: string; sessionId: string; title: string;
      status: string; createdAt: string; updatedAt: string; tags: string[];
      artifactDir: string;
    }) => ipcRenderer.invoke('data:create-task', task),

    persistTaskUpdate: (params: {
      id: string; title?: string; status?: string; updatedAt: string;
    }) => ipcRenderer.invoke('data:update-task', params),

    persistMessage: (msg: {
      id: string; taskId: string; role: string; content: string; timestamp: string;
    }) => ipcRenderer.invoke('data:create-message', msg),

    removeAllListeners: (channel: string) => {
      ipcRenderer.removeAllListeners(channel);
    },
  };
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('clawwork', buildApi());
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore fallback for non-isolated context
  window.electron = electronAPI;
  // @ts-ignore
  window.clawwork = buildApi();
}
