import path from "node:path";
import type { ArchiveSettings, ConversationMessage, ConversationSession } from "./types.js";
import { sanitizePathSegment } from "./fs-utils.js";

const secretPatterns: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN)\s*=\s*["']?[^"'\s]+/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g
];

export function renderMarkdown(session: ConversationSession, settings: ArchiveSettings) {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`source: ${yamlString(session.source)}`);
  lines.push(`session_id: ${yamlString(session.sessionId)}`);
  lines.push(`project: ${yamlString(session.projectName)}`);
  lines.push(`project_path: ${yamlString(session.projectPath)}`);
  lines.push(`started_at: ${yamlString(session.startedAt)}`);
  lines.push(`updated_at: ${yamlString(session.updatedAt)}`);
  lines.push(`raw_path: ${yamlString(session.rawPath)}`);
  lines.push("tags:");
  lines.push("  - ai/conversation");
  lines.push("  - relay-switch");
  lines.push(`  - ${yamlString(session.source)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${markdownText(session.title, settings.redactSecrets)}`);
  lines.push("");

  for (const message of session.messages) {
    lines.push(`## ${roleHeading(message.role)}`);
    lines.push("");
    if (message.timestamp) {
      lines.push("`" + markdownText(message.timestamp, settings.redactSecrets) + "`");
      lines.push("");
    }
    const text = markdownText(message.text || "_No text content._", settings.redactSecrets);
    lines.push(text.trim() || "_No text content._");
    lines.push("");
  }

  return lines.join("\n");
}

export function outputPathForSession(outputDirectory: string, session: ConversationSession) {
  const sourceDir = session.source === "claude-code" ? "Claude Code" : "Codex CLI";
  const projectName = sanitizePathSegment(session.projectName, "Unknown Project");
  const timestamp = safeTimestamp(session.startedAt || session.updatedAt);
  const sessionId = sanitizePathSegment(session.sessionId.slice(0, 12), "session");
  const title = sanitizePathSegment(session.title.replace(session.sourceTitle, ""), "Conversation");
  const fileName = `${timestamp} ${sessionId} ${title}.md`.replace(/\s+/g, " ").trim();
  return path.join(outputDirectory, "AI Conversations", sourceDir, projectName, fileName);
}

export function redactSecrets(value: string) {
  let redacted = value;
  for (const pattern of secretPatterns) {
    redacted = redacted.replace(pattern, "[redacted]");
  }
  return redacted;
}

function markdownText(value: string, redact: boolean) {
  return redact ? redactSecrets(value) : value;
}

function yamlString(value: string) {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function roleHeading(role: ConversationMessage["role"]) {
  switch (role) {
    case "user":
      return "User";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    default:
      return "Event";
  }
}

function safeTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "undated";
  }
  return date.toISOString().slice(0, 16).replace("T", " ").replace(/:/g, "-");
}
