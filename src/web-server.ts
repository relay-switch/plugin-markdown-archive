import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncArchive } from "./archive.js";
import { discoverTranscriptRefs } from "./discovery.js";
import { renderMarkdown, redactSecrets } from "./markdown.js";
import { loadConversationSession } from "./parser.js";
import type { ArchiveSettings, ConversationMessage, ConversationSession, RawSessionRef, SyncResult } from "./types.js";

const defaultHost = "127.0.0.1";
const defaultPort = 43178;
const maxSessions = 500;

export interface WebServerHandle {
  host: string;
  port: number;
  url: string;
  close: () => Promise<void>;
}

export interface WebServerOptions {
  host?: string;
  port?: number;
}

export interface BrowserSessionSummary {
  id: string;
  source: ConversationSession["source"];
  sourceTitle: string;
  sessionId: string;
  title: string;
  projectName: string;
  projectPath: string;
  startedAt: string;
  updatedAt: string;
  rawPath: string;
  rawSize: number;
  messageCount: number;
  roleCounts: Record<ConversationMessage["role"], number>;
  preview: string;
}

interface BrowserSessionError {
  path: string;
  source: ConversationSession["source"];
  error: string;
}

export async function startWebServer(settingsProvider: () => ArchiveSettings, options: WebServerOptions = {}): Promise<WebServerHandle> {
  const host = options.host || defaultHost;
  const requestedPort = normalizePort(options.port, defaultPort);
  const server = createServer((request, response) => {
    void handleRequest(request, response, settingsProvider).catch((error) => {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode: number }).statusCode)
        : 500;
      writeJSON(response, Number.isFinite(statusCode) ? statusCode : 500, {
        error: error instanceof Error ? error.message : "请求失败。"
      });
    });
  });

  let port: number;
  try {
    port = await listen(server, host, requestedPort);
  } catch (error) {
    if (requestedPort !== 0 && isAddressInUse(error)) {
      port = await listen(server, host, 0);
    } else {
      throw error;
    }
  }

  return {
    host,
    port,
    url: "http://" + host + ":" + port + "/",
    close: () => closeServer(server)
  };
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, settingsProvider: () => ArchiveSettings) {
  const requestURL = new URL(request.url || "/", "http://" + (request.headers.host || "localhost"));
  const method = request.method || "GET";

  if (requestURL.pathname === "/api/health" && method === "GET") {
    writeJSON(response, 200, {
      status: "ok",
      settings: publicSettings(settingsProvider())
    });
    return;
  }

  if (requestURL.pathname === "/api/sessions" && method === "GET") {
    writeJSON(response, 200, await listSessions(settingsProvider(), requestURL.searchParams));
    return;
  }

  if (requestURL.pathname.startsWith("/api/sessions/") && method === "GET") {
    const id = decodeURIComponent(requestURL.pathname.slice("/api/sessions/".length));
    writeJSON(response, 200, await getSessionDetail(settingsProvider(), id));
    return;
  }

  if (requestURL.pathname === "/api/sync" && method === "POST") {
    const result: SyncResult = await syncArchive(settingsProvider());
    writeJSON(response, result.status === "failed" ? 400 : 200, result);
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    writeJSON(response, 405, { error: "不支持的请求方法。" });
    return;
  }

  await serveStatic(requestURL.pathname, response);
}

async function listSessions(settings: ArchiveSettings, params: URLSearchParams) {
  const refs = await discoverTranscriptRefs(settings);
  const items: BrowserSessionSummary[] = [];
  const errors: BrowserSessionError[] = [];

  for (const ref of refs) {
    try {
      const session = await loadConversationSession(ref, settings);
      items.push(summarizeSession(session, settings));
    } catch (error) {
      errors.push({
        path: ref.path,
        source: ref.source,
        error: error instanceof Error ? error.message : "解析会话记录失败。"
      });
    }
  }

  const source = sourceFilter(params.get("source"));
  const project = (params.get("project") || "").trim();
  const query = (params.get("q") || "").trim().toLowerCase();
  const projects = [...new Set(items.map((item) => item.projectName).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  const sourceCounts = countSources(items);

  let filtered = items;
  if (source) {
    filtered = filtered.filter((item) => item.source === source);
  }
  if (project) {
    filtered = filtered.filter((item) => item.projectName === project);
  }
  if (query) {
    filtered = filtered.filter((item) => sessionMatchesQuery(item, query));
  }

  filtered = filtered.sort((left, right) => dateValue(right.updatedAt) - dateValue(left.updatedAt));
  const limit = normalizeLimit(params.get("limit"));

  return {
    items: filtered.slice(0, limit),
    total: filtered.length,
    unfilteredTotal: items.length,
    projects,
    sourceCounts,
    errors
  };
}

async function getSessionDetail(settings: ArchiveSettings, id: string) {
  const rawPath = pathFromSessionID(id);
  const refs = await discoverTranscriptRefs(settings);
  const ref = refs.find((item) => item.path === rawPath);
  if (!ref) {
    const error = new Error("未找到会话。");
    Object.assign(error, { statusCode: 404 });
    throw error;
  }

  const session = sanitizeSession(await loadConversationSession(ref, settings), settings);
  return {
    session: {
      ...session,
      id: sessionID(session.rawPath)
    },
    markdown: renderMarkdown(session, settings)
  };
}

function summarizeSession(session: ConversationSession, settings: ArchiveSettings): BrowserSessionSummary {
  const roleCounts: Record<ConversationMessage["role"], number> = {
    user: 0,
    assistant: 0,
    system: 0,
    tool: 0,
    event: 0
  };
  for (const message of session.messages) {
    roleCounts[message.role]++;
  }
  const previewMessage = session.messages.find((message) => message.text.trim() !== "");
  const preview = previewMessage ? redactMaybe(previewMessage.text, settings).replace(/\s+/g, " ").trim() : "";

  return {
    id: sessionID(session.rawPath),
    source: session.source,
    sourceTitle: session.sourceTitle,
    sessionId: session.sessionId,
    title: redactMaybe(session.title, settings),
    projectName: session.projectName,
    projectPath: session.projectPath,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    rawPath: session.rawPath,
    rawSize: session.rawSize,
    messageCount: session.messages.length,
    roleCounts,
    preview
  };
}

function sanitizeSession(session: ConversationSession, settings: ArchiveSettings): ConversationSession {
  return {
    ...session,
    title: redactMaybe(session.title, settings),
    messages: session.messages.map((message) => ({
      ...message,
      text: redactMaybe(message.text, settings)
    }))
  };
}

function sessionMatchesQuery(item: BrowserSessionSummary, query: string) {
  return [item.title, item.projectName, item.projectPath, item.sessionId, item.preview, item.rawPath]
    .some((value) => value.toLowerCase().includes(query));
}

function countSources(items: BrowserSessionSummary[]) {
  return items.reduce((counts, item) => {
    counts[item.source] = (counts[item.source] || 0) + 1;
    return counts;
  }, {} as Record<ConversationSession["source"], number>);
}

function redactMaybe(value: string, settings: ArchiveSettings) {
  return settings.redactSecrets ? redactSecrets(value) : value;
}

function sessionID(rawPath: string) {
  return Buffer.from(rawPath, "utf8").toString("base64url");
}

function pathFromSessionID(id: string) {
  return Buffer.from(id, "base64url").toString("utf8");
}

function sourceFilter(value: string | null): RawSessionRef["source"] | "" {
  return value === "claude-code" || value === "codex-cli" ? value : "";
}

function normalizeLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : maxSessions;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return maxSessions;
  }
  return Math.min(parsed, maxSessions);
}

function normalizePort(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function dateValue(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function publicSettings(settings: ArchiveSettings) {
  return {
    archiveEnabled: settings.archiveEnabled,
    outputDirectory: settings.outputDirectory,
    includeClaudeCode: settings.includeClaudeCode,
    includeCodexCLI: settings.includeCodexCLI,
    includeSystemEvents: settings.includeSystemEvents,
    includeToolCalls: settings.includeToolCalls,
    redactSecrets: settings.redactSecrets,
    overwriteExisting: settings.overwriteExisting
  };
}

async function serveStatic(urlPath: string, response: ServerResponse) {
  const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist-web");
  let pathname = decodeURIComponent(urlPath);
  if (pathname === "/") {
    pathname = "/index.html";
  }

  const filePath = path.normalize(path.join(webRoot, pathname.replace(/^\/+/, "")));
  if (!filePath.startsWith(webRoot + path.sep) && filePath !== webRoot) {
    writeJSON(response, 403, { error: "禁止访问。" });
    return;
  }

  try {
    const content = await fs.readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(content);
  } catch (error) {
    if (path.extname(pathname) === "") {
      try {
        const content = await fs.readFile(path.join(webRoot, "index.html"));
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(content);
        return;
      } catch {
        writeMissingApp(response);
        return;
      }
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      writeJSON(response, 404, { error: "未找到。" });
      return;
    }
    throw error;
  }
}

function contentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon"
  };
  return types[extension] || "application/octet-stream";
}

function writeJSON(response: ServerResponse, statusCode: number, payload: unknown) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(body);
}

function writeMissingApp(response: ServerResponse) {
  response.writeHead(503, { "content-type": "text/html; charset=utf-8" });
  response.end("<!doctype html><title>Markdown 归档</title><main style=\"font-family:system-ui;padding:32px\"><h1>Web 资源尚未构建</h1><p>启动浏览器前请先运行 pnpm build:web。</p></main>");
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : port);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function isAddressInUse(error: unknown) {
  return typeof error === "object" && error !== null && (error as NodeJS.ErrnoException).code === "EADDRINUSE";
}
