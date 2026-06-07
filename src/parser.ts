import { promises as fs } from "node:fs";
import path from "node:path";
import type { ArchiveSettings, ConversationMessage, ConversationSession, RawSessionRef } from "./types.js";

export async function loadConversationSession(ref: RawSessionRef, settings: ArchiveSettings): Promise<ConversationSession> {
  const stat = await fs.stat(ref.path);
  const content = await fs.readFile(ref.path, "utf8");
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  let sessionId = path.basename(ref.path, path.extname(ref.path));
  let title = "";
  let projectPath = "";
  let startedAt = "";
  let updatedAt = stat.mtime.toISOString();
  const messages: ConversationMessage[] = [];
  let ignoredLines = 0;

  for (const line of lines) {
    const raw = parseLine(line);
    if (!raw) {
      ignoredLines++;
      continue;
    }

    sessionId = firstString(raw, ["sessionId", "session_id", "conversation_id"]) ||
      firstNestedString(raw, [["payload", "session_id"], ["payload", "sessionId"]]) ||
      sessionId;
    projectPath = firstString(raw, ["cwd", "project_path", "projectPath"]) ||
      firstNestedString(raw, [["payload", "cwd"], ["message", "cwd"]]) ||
      projectPath;
    title = firstString(raw, ["title", "summary"]) || title;

    const rawType = firstString(raw, ["type", "event", "kind"]);
    const nestedRole = firstNestedString(raw, [["message", "role"], ["payload", "role"]]);
    const role = normalizeRole(firstString(raw, ["role"]) || nestedRole, rawType);
    if (!settings.includeSystemEvents && (role === "system" || role === "event")) {
      continue;
    }

    const text = textFromRaw(raw, settings.includeToolCalls);
    if (!text.trim() && (role === "user" || role === "assistant")) {
      continue;
    }

    const timestamp = firstString(raw, ["timestamp", "created_at", "createdAt", "time"]) ||
      firstNestedString(raw, [["payload", "timestamp"], ["message", "timestamp"]]);
    if (!startedAt && timestamp) {
      startedAt = timestamp;
    }
    if (timestamp) {
      updatedAt = timestamp;
    }

    messages.push({
      role,
      text,
      timestamp,
      rawType,
      metadata: {
        lineType: rawType || undefined
      }
    });
  }

  const projectName = projectPath ? path.basename(projectPath) : "Unknown Project";
  if (!title) {
    title = `${ref.sourceTitle} - ${projectName}`;
  }
  if (!startedAt) {
    startedAt = updatedAt;
  }

  return {
    source: ref.source,
    sourceTitle: ref.sourceTitle,
    sessionId,
    title,
    projectPath,
    projectName,
    startedAt,
    updatedAt,
    rawPath: ref.path,
    rawMtime: Math.floor(stat.mtimeMs),
    rawSize: stat.size,
    messages,
    metadata: {
      raw_path: ref.path,
      ignored_lines: String(ignoredLines)
    }
  };
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRole(role: string, rawType: string): ConversationMessage["role"] {
  const normalized = role.toLowerCase();
  if (normalized === "user" || normalized === "assistant" || normalized === "system" || normalized === "tool") {
    return normalized;
  }
  const type = rawType.toLowerCase();
  if (type === "user") {
    return "user";
  }
  if (type === "assistant") {
    return "assistant";
  }
  if (type.includes("tool")) {
    return "tool";
  }
  if (type.includes("system")) {
    return "system";
  }
  return "event";
}

function textFromRaw(raw: Record<string, unknown>, includeToolCalls: boolean): string {
  const direct = firstString(raw, ["text", "content", "message"]);
  if (direct) {
    return direct;
  }

  const message = raw.message;
  if (typeof message === "string") {
    return message;
  }
  if (isObject(message)) {
    const nested = firstString(message, ["text", "content"]);
    if (nested) {
      return nested;
    }
    const content = message.content;
    const rendered = renderContent(content, includeToolCalls);
    if (rendered) {
      return rendered;
    }
  }

  const payload = raw.payload;
  if (isObject(payload)) {
    const nested = firstString(payload, ["text", "content"]);
    if (nested) {
      return nested;
    }
    const rendered = renderContent(payload.content, includeToolCalls);
    if (rendered) {
      return rendered;
    }
  }

  return includeToolCalls ? renderContent(raw, includeToolCalls) : "";
}

function renderContent(value: unknown, includeToolCalls: boolean): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => renderContent(item, includeToolCalls))
      .filter((item) => item.trim() !== "");
    return parts.join("\n\n");
  }
  if (!isObject(value)) {
    return "";
  }
  const text = firstString(value, ["text", "content"]);
  if (text) {
    return text;
  }
  const type = firstString(value, ["type", "kind"]);
  if (!includeToolCalls && type.toLowerCase().includes("tool")) {
    return "";
  }
  if (includeToolCalls && Object.keys(value).length > 0) {
    return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
  }
  return "";
}

function firstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
  }
  return "";
}

function firstNestedString(source: Record<string, unknown>, paths: string[][]) {
  for (const itemPath of paths) {
    let current: unknown = source;
    for (const segment of itemPath) {
      if (!isObject(current)) {
        current = undefined;
        break;
      }
      current = current[segment];
    }
    if (typeof current === "string" && current.trim() !== "") {
      return current;
    }
  }
  return "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
