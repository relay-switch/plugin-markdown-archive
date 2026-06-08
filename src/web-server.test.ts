import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { defaultSettings } from "./settings.js";
import { startWebServer } from "./web-server.js";

test("serves local transcript sessions over HTTP", async () => {
  const homeDir = await mkdtemp(path.join(os.tmpdir(), "markdown-archive-web-home-"));
  const outputDirectory = await mkdtemp(path.join(os.tmpdir(), "markdown-archive-web-output-"));
  const originalHome = process.env.HOME;
  process.env.HOME = homeDir;
  try {
    const transcriptPath = path.join(homeDir, ".codex", "sessions", "2026", "codex-session.jsonl");
    await writeTranscript(transcriptPath, [
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

    const server = await startWebServer(() => ({
      ...defaultSettings,
      outputDirectory,
      includeClaudeCode: false,
      includeCodexCLI: true
    }), { port: 0 });
    try {
      const listResponse = await fetch(server.url + "api/sessions");
      assert.equal(listResponse.status, 200);
      const list = await listResponse.json() as { items: Array<{ id: string; title: string; messageCount: number }> };
      assert.equal(list.items.length, 1);
      assert.equal(list.items[0]?.messageCount, 2);

      const detailResponse = await fetch(server.url + "api/sessions/" + encodeURIComponent(list.items[0]?.id || ""));
      assert.equal(detailResponse.status, 200);
      const detail = await detailResponse.json() as { session: { messages: unknown[] }; markdown: string };
      assert.equal(detail.session.messages.length, 2);
      assert.match(detail.markdown, /codex done/);
    } finally {
      await server.close();
    }
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
