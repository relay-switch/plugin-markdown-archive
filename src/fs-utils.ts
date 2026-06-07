import { promises as fs } from "node:fs";
import path from "node:path";

export async function pathExists(target: string) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function walkFiles(root: string, predicate: (filePath: string) => boolean) {
  const results: string[] = [];
  if (!(await pathExists(root))) {
    return results;
  }

  async function visit(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (entry.isFile() && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }

  await visit(root);
  results.sort();
  return results;
}

export async function atomicWriteFile(target: string, content: string) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tempPath = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, target);
}

export function sanitizePathSegment(value: string, fallback: string) {
  const trimmed = value.trim();
  const sanitized = trimmed
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+$/, "")
    .trim();
  return sanitized || fallback;
}
