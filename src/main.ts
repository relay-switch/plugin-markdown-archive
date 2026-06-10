#!/usr/bin/env node
import { spawn } from "node:child_process";
import { JsonRpcServer, log } from "./json-rpc.js";
import { defaultSettings, normalizeSettings } from "./settings.js";
import { syncArchive } from "./archive.js";
import { startWebServer, type WebServerHandle } from "./web-server.js";
import type { ArchiveSettings, RuntimeStatus, SyncResult } from "./types.js";

const syncNowCommand = "markdownArchive.syncNow";
const openOutputDirectoryCommand = "markdownArchive.openOutputDirectory";
const openBrowserCommand = "markdownArchive.openBrowser";
const defaultBrowserPort = 43178;

class MarkdownArchiveRuntime {
  private settings: ArchiveSettings = defaultSettings;
  private timer: NodeJS.Timeout | null = null;
  private webServer: WebServerHandle | null = null;
  private syncRunning = false;
  private lastRun = "";
  private lastSuccess = "";
  private lastError = "";
  private exportedCount = 0;
  private skippedCount = 0;
  private failedCount = 0;
  private nextRun = "";

  async initialize(params: unknown) {
    const settings = objectValue(params)?.settings;
    this.settings = normalizeSettings(settings);
    this.configureTimer();
    return this.status();
  }

  async shutdown() {
    this.stopTimer();
    await this.stopWebServer();
    return { status: "success" };
  }

  async settingsChanged(params: unknown) {
    const values = objectValue(params)?.values;
    this.settings = normalizeSettings(values);
    this.configureTimer();
    return this.status();
  }

  async executeCommand(params: unknown) {
    const commandId = stringValue(objectValue(params)?.commandId);
    switch (commandId) {
      case syncNowCommand:
        return this.runSync("manual");
      case openOutputDirectoryCommand:
        return this.openOutputDirectory();
      case openBrowserCommand:
        return this.openBrowser();
      default:
        throw new Error("不支持的命令: " + commandId);
    }
  }

  async getStatus() {
    return this.status();
  }

  private async runSync(mode: "manual" | "auto") {
    if (this.syncRunning) {
      return {
        status: "skipped",
        message: "同步已在运行中。"
      };
    }
    if (mode === "auto" && (!this.settings.archiveEnabled || !this.settings.autoSync)) {
      return {
        status: "skipped",
        message: "自动同步已停用。"
      };
    }

    this.syncRunning = true;
    this.lastRun = new Date().toISOString();
    try {
      const result = await syncArchive(this.settings);
      this.applySyncResult(result);
      if (result.status === "failed") {
        this.lastError = result.failures[0]?.error ?? "同步失败。";
        return {
          status: "failed",
          message: this.lastError,
          result
        };
      }
      this.lastSuccess = new Date().toISOString();
      this.lastError = "";
      return {
        status: result.status,
        message: "已导出 " + result.exportedCount + "，已跳过 " + result.skippedCount + "，失败 " + result.failedCount + "。",
        result
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "同步失败。";
      this.failedCount++;
      return {
        status: "failed",
        message: this.lastError
      };
    } finally {
      this.syncRunning = false;
      this.configureTimer();
    }
  }

  private async openOutputDirectory() {
    if (!this.settings.outputDirectory) {
      return {
        status: "failed",
        message: "尚未配置输出目录。"
      };
    }

    const opened = openExternal(this.settings.outputDirectory);
    if (!opened) {
      return {
        status: "failed",
        message: "当前平台不支持打开输出目录: " + process.platform + "。"
      };
    }
    return {
      status: "success",
      message: "输出目录已打开。"
    };
  }

  private async openBrowser() {
    const server = await this.ensureWebServer();
    openExternal(server.url);
    return {
      status: "success",
      message: "会话浏览器已运行: " + server.url,
      url: server.url
    };
  }

  private async ensureWebServer() {
    if (this.webServer) {
      return this.webServer;
    }
    this.webServer = await startWebServer(() => this.settings, {
      port: portFromEnv(process.env.MARKDOWN_ARCHIVE_BROWSER_PORT)
    });
    return this.webServer;
  }

  private async stopWebServer() {
    if (!this.webServer) {
      return;
    }
    const server = this.webServer;
    this.webServer = null;
    await server.close();
  }

  private configureTimer() {
    this.stopTimer();
    if (!this.settings.archiveEnabled || !this.settings.autoSync || !this.settings.outputDirectory) {
      this.nextRun = "";
      return;
    }

    const intervalMs = Math.max(30, this.settings.syncIntervalSeconds) * 1000;
    this.nextRun = new Date(Date.now() + intervalMs).toISOString();
    this.timer = setInterval(() => {
      void this.runSync("auto");
    }, intervalMs);
  }

  private stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private applySyncResult(result: SyncResult) {
    this.exportedCount = result.exportedCount;
    this.skippedCount = result.skippedCount;
    this.failedCount = result.failedCount;
  }

  private status(): RuntimeStatus {
    return {
      archiveEnabled: this.settings.archiveEnabled,
      autoSync: this.settings.autoSync,
      outputDirectory: this.settings.outputDirectory,
      lastRun: this.lastRun,
      lastSuccess: this.lastSuccess,
      lastError: this.lastError,
      exportedCount: this.exportedCount,
      skippedCount: this.skippedCount,
      failedCount: this.failedCount,
      nextRun: this.nextRun
    };
  }
}

function openerCommand() {
  switch (process.platform) {
    case "darwin":
      return { command: "open", args: [] };
    case "win32":
      return { command: "cmd", args: ["/c", "start", ""] };
    case "linux":
      return { command: "xdg-open", args: [] };
    default:
      return null;
  }
}

function openExternal(target: string) {
  const opener = openerCommand();
  if (!opener) {
    return false;
  }
  const child = spawn(opener.command, [...opener.args, target], {
    detached: true,
    stdio: "ignore"
  });
  child.unref();
  return true;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function portFromEnv(value: string | undefined) {
  if (!value) {
    return defaultBrowserPort;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultBrowserPort;
}

function parseWebArgs(args: string[]) {
  const options: { host?: string; port?: number; open: boolean; outputDirectory?: string } = {
    open: false
  };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index] || "";
    const next = args[index + 1];
    if (arg === "--open") {
      options.open = true;
    } else if (arg === "--host" && next) {
      options.host = next;
      index++;
    } else if (arg.startsWith("--host=")) {
      options.host = arg.slice("--host=".length);
    } else if (arg === "--port" && next) {
      options.port = Number.parseInt(next, 10);
      index++;
    } else if (arg.startsWith("--port=")) {
      options.port = Number.parseInt(arg.slice("--port=".length), 10);
    } else if (arg === "--output" && next) {
      options.outputDirectory = next;
      index++;
    } else if (arg.startsWith("--output=")) {
      options.outputDirectory = arg.slice("--output=".length);
    }
  }
  if (options.port === undefined) {
    options.port = portFromEnv(process.env.MARKDOWN_ARCHIVE_BROWSER_PORT);
  }
  return options;
}

async function runWebMode(args: string[]) {
  const options = parseWebArgs(args);
  const settings = normalizeSettings({
    archiveEnabled: true,
    outputDirectory: options.outputDirectory || process.env.MARKDOWN_ARCHIVE_OUTPUT_DIR || "",
    includeClaudeCode: true,
    includeCodexCLI: true,
    autoSync: false,
    includeSystemEvents: false,
    includeToolCalls: true,
    redactSecrets: true,
    overwriteExisting: true
  });
  const serverOptions: { host?: string; port?: number } = {};
  if (options.host) {
    serverOptions.host = options.host;
  }
  if (options.port !== undefined) {
    serverOptions.port = options.port;
  }
  const server = await startWebServer(() => settings, serverOptions);
  process.stdout.write("Markdown 归档浏览器已运行: " + server.url + "\n");
  if (options.open) {
    openExternal(server.url);
  }

  const stop = () => {
    void server.close().finally(() => process.exit(0));
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

async function main() {
  const mode = process.argv[2] ?? "serve";
  if (mode === "web") {
    await runWebMode(process.argv.slice(3));
    return;
  }
  if (mode !== "serve") {
    process.stderr.write("用法: relay-switch-plugin-markdown-archive serve|web [--host 127.0.0.1] [--port 43178] [--open] [--output DIR]\n");
    process.exitCode = 2;
    return;
  }

  const runtime = new MarkdownArchiveRuntime();
  const server = new JsonRpcServer();
  server.register("initialize", (params) => runtime.initialize(params));
  server.register("shutdown", () => runtime.shutdown());
  server.register("settingsChanged", (params) => runtime.settingsChanged(params));
  server.register("executeCommand", (params) => runtime.executeCommand(params));
  server.register("getStatus", () => runtime.getStatus());
  server.start();
  log("运行时已启动");
}

void main().catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack || error.message : String(error)) + "\n");
  process.exitCode = 1;
});
