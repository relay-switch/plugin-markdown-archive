import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { loadConversationSession } from "./parser.js";
import { defaultSettings } from "./settings.js";

test("loads Claude Code JSONL sessions", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "markdown-archive-parser-"));
  const filePath = path.join(root, "claude-session.jsonl");
  await writeFile(filePath, [
    JSON.stringify({
      sessionId: "claude-session",
      type: "user",
      cwd: "/workspace/relay-switch",
      timestamp: "2026-06-05T06:32:10Z",
      message: { role: "user", content: "hello" }
    }),
    JSON.stringify({
      sessionId: "claude-session",
      type: "assistant",
      timestamp: "2026-06-05T06:33:10Z",
      message: { role: "assistant", content: "done" }
    })
  ].join("\n") + "\n");

  const session = await loadConversationSession({
    source: "claude-code",
    sourceTitle: "Claude Code",
    path: filePath
  }, defaultSettings);

  assert.equal(session.sessionId, "claude-session");
  assert.equal(session.projectName, "relay-switch");
  assert.equal(session.messages.length, 2);
  assert.equal(session.messages[0]?.role, "user");
});

test("loads Codex CLI JSONL sessions and ignores malformed lines", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "markdown-archive-parser-"));
  await mkdir(path.join(root, "sessions"), { recursive: true });
  const filePath = path.join(root, "sessions", "codex-session.jsonl");
  await writeFile(filePath, [
    JSON.stringify({
      session_id: "codex-session",
      role: "user",
      cwd: "/workspace/relay-switch",
      timestamp: "2026-06-05T07:32:10Z",
      content: "codex hello"
    }),
    "{bad json",
    JSON.stringify({
      session_id: "codex-session",
      role: "assistant",
      timestamp: "2026-06-05T07:33:10Z",
      content: "codex done"
    })
  ].join("\n") + "\n");

  const session = await loadConversationSession({
    source: "codex-cli",
    sourceTitle: "Codex CLI",
    path: filePath
  }, defaultSettings);

  assert.equal(session.sessionId, "codex-session");
  assert.equal(session.messages.length, 2);
  assert.equal(session.metadata.ignored_lines, "1");
});
