export type SourceID = "claude-code" | "codex-cli";
export type Role = "user" | "assistant" | "system" | "tool" | "event";

export interface SessionSummary {
  id: string;
  source: SourceID;
  sourceTitle: string;
  sessionId: string;
  title: string;
  projectName: string;
  projectPath: string;
  startedAt: string;
  updatedAt: string;
  rawPath: string;
  rawSize: number;
  messageCount: number;
  roleCounts: Record<Role, number>;
  preview: string;
}

export interface SessionMessage {
  role: Role;
  text: string;
  timestamp: string;
  rawType: string;
}

export interface SessionDetail {
  id: string;
  source: SourceID;
  sourceTitle: string;
  sessionId: string;
  title: string;
  projectName: string;
  projectPath: string;
  startedAt: string;
  updatedAt: string;
  rawPath: string;
  rawSize: number;
  messages: SessionMessage[];
}

export interface SessionsResponse {
  items: SessionSummary[];
  total: number;
  unfilteredTotal: number;
  projects: string[];
  sourceCounts: Partial<Record<SourceID, number>>;
  errors: Array<{ path: string; source: SourceID; error: string }>;
}

export interface SessionDetailResponse {
  session: SessionDetail;
  markdown: string;
}

export interface SyncResult {
  status: "success" | "partial" | "failed";
  outputDirectory: string;
  exportedCount: number;
  skippedCount: number;
  failedCount: number;
  startedAt: string;
  finishedAt: string;
  failures: Array<{ sourceId: SourceID; sessionId?: string; path?: string; error: string }>;
}
