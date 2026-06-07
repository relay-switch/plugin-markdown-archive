export interface ArchiveSettings {
  archiveEnabled: boolean;
  outputDirectory: string;
  includeClaudeCode: boolean;
  includeCodexCLI: boolean;
  autoSync: boolean;
  syncIntervalSeconds: number;
  includeSystemEvents: boolean;
  includeToolCalls: boolean;
  redactSecrets: boolean;
  overwriteExisting: boolean;
}

export interface ConversationSession {
  source: "claude-code" | "codex-cli";
  sourceTitle: string;
  sessionId: string;
  title: string;
  projectPath: string;
  projectName: string;
  startedAt: string;
  updatedAt: string;
  rawPath: string;
  rawMtime: number;
  rawSize: number;
  messages: ConversationMessage[];
  metadata: Record<string, string>;
}

export interface ConversationMessage {
  role: "user" | "assistant" | "system" | "tool" | "event";
  text: string;
  timestamp: string;
  rawType: string;
  metadata?: Record<string, unknown>;
}

export interface RawSessionRef {
  source: ConversationSession["source"];
  sourceTitle: string;
  path: string;
}

export interface ExportState {
  source: ConversationSession["source"];
  sessionId: string;
  rawPath: string;
  rawMtime: number;
  rawSize: number;
  outputPath: string;
  exportedAt: string;
  contentHash: string;
}

export interface SyncSourceResult {
  sourceId: ConversationSession["source"];
  discovered: number;
  exportedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface SyncFailure {
  sourceId: ConversationSession["source"];
  sessionId?: string;
  path?: string;
  error: string;
}

export interface SyncResult {
  status: "success" | "partial" | "failed";
  outputDirectory: string;
  exportedCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string;
  sources: SyncSourceResult[];
  failures: SyncFailure[];
}

export interface RuntimeStatus {
  archiveEnabled: boolean;
  autoSync: boolean;
  outputDirectory: string;
  lastRun: string;
  lastSuccess: string;
  lastError: string;
  exportedCount: number;
  skippedCount: number;
  failedCount: number;
  nextRun: string;
}
