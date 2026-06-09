import { promises as fs } from "node:fs";
import { discoverTranscriptRefs } from "./discovery.js";
import { contentHash, ExportIndex } from "./export-index.js";
import { atomicWriteFile } from "./fs-utils.js";
import { outputPathForSession, renderMarkdown } from "./markdown.js";
import { loadConversationSession } from "./parser.js";
import type { ArchiveSettings, ConversationSession, SyncResult, SyncSourceResult } from "./types.js";

export async function syncArchive(settings: ArchiveSettings): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  const result: SyncResult = {
    status: "success",
    outputDirectory: settings.outputDirectory,
    exportedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    startedAt,
    finishedAt: "",
    sources: [],
    failures: []
  };

  if (!settings.outputDirectory) {
    result.status = "failed";
    result.finishedAt = new Date().toISOString();
    result.failures.push({
      sourceId: "claude-code",
      error: "必须配置输出目录。"
    });
    result.failedCount = 1;
    return result;
  }

  await fs.mkdir(settings.outputDirectory, { recursive: true });
  const index = await ExportIndex.load(settings.outputDirectory);
  const refs = await discoverTranscriptRefs(settings);
  const sourceResults = new Map<ConversationSession["source"], SyncSourceResult>();

  for (const ref of refs) {
    const source = getSourceResult(sourceResults, ref.source);
    source.discovered++;

    let session: ConversationSession;
    try {
      session = await loadConversationSession(ref, settings);
    } catch (error) {
      result.failedCount++;
      source.failedCount++;
      result.failures.push({
        sourceId: ref.source,
        path: ref.path,
        error: error instanceof Error ? error.message : "解析会话记录失败。"
      });
      continue;
    }

    try {
      const outcome = await exportSession(settings, index, session);
      if (outcome === "skipped") {
        result.skippedCount++;
        source.skippedCount++;
      } else {
        result.exportedCount++;
        source.exportedCount++;
      }
    } catch (error) {
      result.failedCount++;
      source.failedCount++;
      result.failures.push({
        sourceId: session.source,
        sessionId: session.sessionId,
        path: session.rawPath,
        error: error instanceof Error ? error.message : "导出会话记录失败。"
      });
    }
  }

  await index.save(settings.outputDirectory);
  result.sources = [...sourceResults.values()].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  result.status = result.failedCount > 0 ? (result.exportedCount > 0 || result.skippedCount > 0 ? "partial" : "failed") : "success";
  result.finishedAt = new Date().toISOString();
  return result;
}

async function exportSession(settings: ArchiveSettings, index: ExportIndex, session: ConversationSession) {
  const existing = index.get(session);
  if (existing && existing.rawMtime === session.rawMtime && existing.rawSize === session.rawSize) {
    try {
      await fs.access(existing.outputPath);
      return "skipped" as const;
    } catch {
      // Re-export when the indexed output disappeared.
    }
  }

  const markdown = renderMarkdown(session, settings);
  const hash = contentHash(markdown);
  const outputPath = outputPathForSession(settings.outputDirectory, session);

  if (!existing && !settings.overwriteExisting) {
    try {
      await fs.access(outputPath);
      return "skipped" as const;
    } catch {
      // Output does not exist; proceed.
    }
  }

  await atomicWriteFile(outputPath, markdown);
  index.set({
    source: session.source,
    sessionId: session.sessionId,
    rawPath: session.rawPath,
    rawMtime: session.rawMtime,
    rawSize: session.rawSize,
    outputPath,
    exportedAt: new Date().toISOString(),
    contentHash: hash
  });
  return "exported" as const;
}

function getSourceResult(sourceResults: Map<ConversationSession["source"], SyncSourceResult>, sourceId: ConversationSession["source"]) {
  const existing = sourceResults.get(sourceId);
  if (existing) {
    return existing;
  }
  const next: SyncSourceResult = {
    sourceId,
    discovered: 0,
    exportedCount: 0,
    skippedCount: 0,
    failedCount: 0
  };
  sourceResults.set(sourceId, next);
  return next;
}
