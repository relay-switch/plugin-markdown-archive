import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { atomicWriteFile, pathExists } from "./fs-utils.js";
import type { ConversationSession, ExportState } from "./types.js";

const indexFileName = ".relay-switch-markdown-archive-index.json";

export class ExportIndex {
  private readonly states = new Map<string, ExportState>();

  static async load(outputDirectory: string) {
    const index = new ExportIndex();
    const filePath = indexPath(outputDirectory);
    if (!(await pathExists(filePath))) {
      return index;
    }
    const content = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      return index;
    }
    for (const item of parsed) {
      if (isExportState(item)) {
        index.states.set(index.key(item.source, item.sessionId), item);
      }
    }
    return index;
  }

  get(session: ConversationSession) {
    return this.states.get(this.key(session.source, session.sessionId));
  }

  set(state: ExportState) {
    this.states.set(this.key(state.source, state.sessionId), state);
  }

  async save(outputDirectory: string) {
    const items = [...this.states.values()].sort((left, right) =>
      `${left.source}:${left.sessionId}`.localeCompare(`${right.source}:${right.sessionId}`)
    );
    await atomicWriteFile(indexPath(outputDirectory), JSON.stringify(items, null, 2) + "\n");
  }

  private key(source: string, sessionId: string) {
    return `${source}::${sessionId}`;
  }
}

export function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

export function indexPath(outputDirectory: string) {
  return path.join(outputDirectory, indexFileName);
}

function isExportState(value: unknown): value is ExportState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Partial<ExportState>;
  return typeof item.source === "string" &&
    typeof item.sessionId === "string" &&
    typeof item.rawPath === "string" &&
    typeof item.rawMtime === "number" &&
    typeof item.rawSize === "number" &&
    typeof item.outputPath === "string" &&
    typeof item.exportedAt === "string" &&
    typeof item.contentHash === "string";
}
