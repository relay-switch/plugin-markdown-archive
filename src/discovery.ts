import os from "node:os";
import path from "node:path";
import { walkFiles } from "./fs-utils.js";
import type { ArchiveSettings, RawSessionRef } from "./types.js";

export async function discoverTranscriptRefs(settings: ArchiveSettings) {
  const refs: RawSessionRef[] = [];
  const homeDir = process.env.HOME || os.homedir();

  if (settings.includeClaudeCode) {
    const root = path.join(homeDir, ".claude", "projects");
    const paths = await walkFiles(root, (filePath) => filePath.endsWith(".jsonl"));
    for (const filePath of paths) {
      refs.push({
        source: "claude-code",
        sourceTitle: "Claude Code",
        path: filePath
      });
    }
  }

  if (settings.includeCodexCLI) {
    const roots = [
      path.join(homeDir, ".codex", "sessions"),
      path.join(homeDir, ".codex", "archived_sessions")
    ];
    for (const root of roots) {
      const paths = await walkFiles(
        root,
        (filePath) => filePath.endsWith(".jsonl") && path.basename(filePath) !== "session_index.jsonl"
      );
      for (const filePath of paths) {
        refs.push({
          source: "codex-cli",
          sourceTitle: "Codex CLI",
          path: filePath
        });
      }
    }
  }

  refs.sort((left, right) => left.path.localeCompare(right.path));
  return refs;
}
