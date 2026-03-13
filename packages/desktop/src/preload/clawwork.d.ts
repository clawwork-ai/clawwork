interface IpcResult {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

interface ConnectionStatus {
  connected: boolean;
  error?: string;
}

interface GatewayEvent {
  event: string;
  payload: Record<string, unknown>;
  gatewayId: string;
  seq?: number;
}

interface GatewayStatusEvent {
  gatewayId: string;
  connected: boolean;
  error?: string;
}

export interface GatewayServerConfig {
  id: string;
  name: string;
  url: string;
  token?: string;
  password?: string;
  isDefault?: boolean;
  color?: string;
}

interface GatewayStatusMap {
  [gatewayId: string]: { connected: boolean; name: string };
}

interface GatewayListItem extends GatewayServerConfig {
  connected: boolean;
}

interface AppSettings {
  workspacePath: string;
  theme?: 'dark' | 'light';
  language?: 'en' | 'zh';
  gateways: GatewayServerConfig[];
  defaultGatewayId?: string;
  // Legacy fields kept for migration detection
  gatewayUrl?: string;
  bootstrapToken?: string;
  password?: string;
  tlsFingerprint?: string;
}

interface SearchResult {
  type: 'task' | 'message' | 'artifact';
  id: string;
  title: string;
  snippet: string;
  taskId?: string;
}

interface SearchResponse {
  ok: boolean;
  results?: SearchResult[];
  error?: string;
}

interface PersistedTask {
  id: string;
  sessionKey: string;
  sessionId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  artifactDir: string;
  gatewayId: string;
}

interface PersistedMessage {
  id: string;
  taskId: string;
  role: string;
  content: string;
  timestamp: string;
}

interface DiscoveredSession {
  gatewayId: string;
  taskId: string;
  sessionKey: string;
  title: string;
  updatedAt: string;
  messages: { role: string; content: string; timestamp: string }[];
}

interface SyncResult {
  ok: boolean;
  discovered?: DiscoveredSession[];
  error?: string;
}

interface ListResult<T> {
  ok: boolean;
  rows?: T[];
  error?: string;
}

interface ChatAttachment {
  mimeType: string;
  fileName: string;
  content: string; // base64
}

export interface ClawWorkAPI {
  // Chat — all require gatewayId
  sendMessage: (gatewayId: string, sessionKey: string, content: string, attachments?: ChatAttachment[]) => Promise<IpcResult>;
  chatHistory: (gatewayId: string, sessionKey: string, limit?: number) => Promise<IpcResult>;
  listSessions: (gatewayId: string) => Promise<IpcResult>;
  abortChat: (gatewayId: string, sessionKey: string) => Promise<IpcResult>;

  // Gateway status — returns map of all gateways
  gatewayStatus: () => Promise<GatewayStatusMap>;
  syncSessions: () => Promise<SyncResult>;
  listGateways: () => Promise<GatewayListItem[]>;

  // Push events from main process
  onGatewayEvent: (callback: (data: GatewayEvent) => void) => (() => void);
  onGatewayStatus: (callback: (status: GatewayStatusEvent) => void) => (() => void);
  removeAllListeners: (channel: string) => void;

  // Data persistence
  loadTasks: () => Promise<ListResult<PersistedTask>>;
  loadMessages: (taskId: string) => Promise<ListResult<PersistedMessage>>;

  // Artifacts
  saveArtifact: (params: {
    taskId: string;
    sourcePath: string;
    messageId: string;
    fileName?: string;
    mediaType?: string;
  }) => Promise<IpcResult>;
  listArtifacts: (taskId?: string) => Promise<IpcResult>;
  getArtifact: (id: string) => Promise<IpcResult>;
  readArtifactFile: (localPath: string) => Promise<IpcResult>;
  onArtifactSaved: (callback: (artifact: unknown) => void) => void;

  // Workspace
  isWorkspaceConfigured: () => Promise<boolean>;
  getWorkspacePath: () => Promise<string | null>;
  getDefaultWorkspacePath: () => Promise<string>;
  browseWorkspace: () => Promise<string | null>;
  setupWorkspace: (path: string) => Promise<IpcResult>;

  // Settings
  getSettings: () => Promise<AppSettings | null>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<{ ok: boolean; config: AppSettings }>;

  // Gateway management
  addGateway: (gateway: GatewayServerConfig) => Promise<IpcResult>;
  removeGateway: (gatewayId: string) => Promise<IpcResult>;
  updateGateway: (gatewayId: string, partial: Partial<GatewayServerConfig>) => Promise<IpcResult>;
  setDefaultGateway: (gatewayId: string) => Promise<IpcResult>;
  testGateway: (url: string, auth: { token?: string; password?: string }) => Promise<IpcResult>;

  // Search
  globalSearch: (query: string) => Promise<SearchResponse>;

  // Task persistence
  persistTask: (task: {
    id: string; sessionKey: string; sessionId: string; title: string;
    status: string; createdAt: string; updatedAt: string; tags: string[];
    artifactDir: string; gatewayId: string;
  }) => Promise<IpcResult>;

  persistTaskUpdate: (params: {
    id: string; title?: string; status?: string; updatedAt: string;
  }) => Promise<IpcResult>;

  persistMessage: (msg: {
    id: string; taskId: string; role: string; content: string; timestamp: string;
  }) => Promise<IpcResult>;
}

declare global {
  interface Window {
    clawwork: ClawWorkAPI;
  }
}
