import test from "node:test";
import assert from "node:assert/strict";
import { outputPathForSession, redactSecrets, renderMarkdown } from "./markdown.js";
import { defaultSettings } from "./settings.js";
import type { ConversationSession } from "./types.js";

const session: ConversationSession = {
  source: "claude-code",
  sourceTitle: "Claude Code",
  sessionId: "abc123456789",
  title: "Claude Code - relay-switch",
  projectPath: "/workspace/relay-switch",
  projectName: "relay-switch",
  startedAt: "2026-06-05T06:32:10Z",
  updatedAt: "2026-06-05T06:33:10Z",
  rawPath: "/tmp/session.jsonl",
  rawMtime: 1,
  rawSize: 2,
  messages: [
    {
      role: "user",
      text: "hello sk-abcdefghijklmnop",
      timestamp: "2026-06-05T06:32:10Z",
      rawType: "user"
    },
    {
      role: "assistant",
      text: "done",
      timestamp: "2026-06-05T06:33:10Z",
      rawType: "assistant"
    }
  ],
  metadata: {}
};

test("renders Obsidian-friendly Markdown with redaction", () => {
  const markdown = renderMarkdown(session, defaultSettings);
  assert.match(markdown, /source: "claude-code"/);
  assert.match(markdown, /## User/);
  assert.match(markdown, /\[redacted\]/);
  assert.doesNotMatch(markdown, /sk-abcdefghijklmnop/);
});

test("builds stable output paths", () => {
  const outputPath = outputPathForSession("/archive", session);
  assert.match(outputPath, /AI Conversations/);
  assert.match(outputPath, /Claude Code/);
  assert.match(outputPath, /relay-switch/);
  assert.match(outputPath, /2026-06-05 06-32/);
});

test("redacts common token forms", () => {
  assert.equal(redactSecrets("Bearer abcdefghijklmnopqrstuvwxyz"), "[redacted]");
  assert.equal(redactSecrets("GITHUB_TOKEN=ghp_abcdefghijklmnopqrstuvwxyz"), "[redacted]");
});
