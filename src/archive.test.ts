import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { syncArchive } from "./archive.js";
import { defaultSettings } from "./settings.js";

test("syncs Claude and Codex transcripts to Markdown and skips unchanged sessions", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "markdown-archive-home-"));
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "markdown-archive-output-"));
  const originalHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    const claudePath = path.join(homeDir, ".claude", "projects", "relay-switch", "claude-session.jsonl");
    const codexPath = path.join(homeDir, ".codex", "sessions", "2026", "codex-session.jsonl");
    await writeTranscript(claudePath, [
      {
        sessionId: "claude-session",
        type: "user",
        cwd: "/workspace/relay-switch",
        timestamp: "2026-06-05T06:32:10Z",
        message: { role: "user", content: "hello" }
      },
      {
        sessionId: "claude-session",
        type: "assistant",
        timestamp: "2026-06-05T06:33:10Z",
        message: { role: "assistant", content: "done" }
      }
    ]);
    await writeTranscript(codexPath, [
      {
        session_id: "codex-session",
        role: "user",
        cwd: "/workspace/relay-switch",
        timestamp: "2026-06-05T07:32:10Z",
        content: "codex hello"
      },
      {
        session_id: "codex-session",
        role: "assistant",
        timestamp: "2026-06-05T07:33:10Z",
        content: "codex done"
      }
    ]);

    const first = await syncArchive({
      ...defaultSettings,
      outputDirectory
    });
    assert.equal(first.status, "success");
    assert.equal(first.exportedCount, 2);
    assert.equal(first.skippedCount, 0);

    const indexContent = await readFile(path.join(outputDirectory, ".relay-switch-markdown-archive-index.json"), "utf8");
    assert.match(indexContent, /claude-session/);
    assert.match(indexContent, /codex-session/);

    const second = await syncArchive({
      ...defaultSettings,
      outputDirectory
    });
    assert.equal(second.status, "success");
    assert.equal(second.exportedCount, 0);
    assert.equal(second.skippedCount, 2);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
  }
});

async function writeTranscript(filePath: string, events: unknown[]) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, events.map((event) => JSON.stringify(event)).join("\n") + "\n", {
    encoding: "utf8"
  });
}
