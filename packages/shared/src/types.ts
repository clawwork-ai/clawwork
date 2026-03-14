// ============================================================
// ClawWork Core Types
// Shared between Desktop App and Channel Plugin
// ============================================================

/** Task status lifecycle: active → completed → archived */
export type TaskStatus = 'active' | 'completed' | 'archived';

/** Message sender role */
export type MessageRole = 'user' | 'assistant' | 'system';

/** Artifact content type */
export type ArtifactType = 'file' | 'code' | 'image' | 'link' | 'structured_data';

/** Tool call execution status */
export type ToolCallStatus = 'running' | 'done' | 'error';

// ------------------------------------------------------------
// Gateway Server Configuration
// ------------------------------------------------------------

import type { GatewayAuth } from './gateway-protocol.js';

/** A configured OpenClaw Gateway server instance */
export interface GatewayServer {
  id: string;
  name: string;
  url: string;
  auth: GatewayAuth;
  isDefault: boolean;
  color?: string;
}

// Re-export GatewayAuth so consumers don't need a second import
export type { GatewayAuth } from './gateway-protocol.js';

// ------------------------------------------------------------
// Core Entities
// ------------------------------------------------------------

export interface Task {
  id: string;
  sessionKey: string;
  sessionId: string;
  title: string;
  status: TaskStatus;
  createdAt: string; // ISO 8601
  updatedAt: string;
  tags: string[];
  artifactDir: string;
  gatewayId: string;
  agentId?: string;
  model?: string;
  modelProvider?: string;
  thinkingLevel?: string;
  inputTokens?: number;
  outputTokens?: number;
  contextTokens?: number;
}

/** Image attachment stored with a user message for UI preview */
export interface MessageImageAttachment {
  fileName: string;
  /** data URL (e.g. "data:image/png;base64,...") for rendering in <img> */
  dataUrl: string;
}

export interface Message {
  id: string;
  taskId: string;
  role: MessageRole;
  content: string;
  artifacts: Artifact[];
  toolCalls: ToolCall[];
  /** Image attachments sent with user messages (for inline preview) */
  imageAttachments?: MessageImageAttachment[];
  timestamp: string; // ISO 8601
  runId?: string;
  thinkingContent?: string;
}

export interface Artifact {
  id: string;
  taskId: string;
  messageId: string;
  type: ArtifactType;
  name: string;
  /** Original source path (e.g. from sendMedia) */
  filePath: string;
  /** Relative path within workspace: <taskId>/<filename> */
  localPath: string;
  mimeType: string;
  size: number;
  /** Git commit SHA from auto-commit, empty if not yet committed */
  gitSha: string;
  createdAt: string;
}

export interface ToolCall {
  id: string;
  name: string;
  status: ToolCallStatus;
  args?: Record<string, unknown>;
  result?: string;
  startedAt: string;
  completedAt?: string;
}

// ------------------------------------------------------------
// Progress tracking (extracted from AI responses)
// ------------------------------------------------------------

export interface ProgressStep {
  label: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// ------------------------------------------------------------
// Chat Attachments (for Gateway chat.send)
// ------------------------------------------------------------

/** Image attachment sent via Gateway chat.send. Only image/* MIME types are supported. */
export interface ChatAttachment {
  mimeType: string;   // e.g. "image/png", "image/jpeg"
  fileName: string;
  content: string;    // base64-encoded (no data URL prefix)
}

// ------------------------------------------------------------
// Gateway Agent / Model catalog
// ------------------------------------------------------------

export interface AgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
  avatarUrl?: string;
}

export interface AgentInfo {
  id: string;
  name?: string;
  identity?: AgentIdentity;
}

export interface AgentListResponse {
  defaultId: string;
  mainKey: string;
  scope: string;
  agents: AgentInfo[];
}

export interface ModelCatalogEntry {
  id: string;
  name?: string;
  provider?: string;
  [key: string]: unknown;
}

export interface ModelListResponse {
  models: ModelCatalogEntry[];
}

export interface SessionPatchParams {
  sessionKey: string;
  thinkingLevel?: string | null;
  fastMode?: boolean | null;
  model?: string | null;
  reasoningLevel?: string | null;
  elevatedLevel?: string | null;
  verboseLevel?: string | null;
  responseUsage?: string | null;
  label?: string | null;
}
