#!/usr/bin/env node
import { spawn } from "node:child_process";
import { JsonRpcServer, log } from "./json-rpc.js";
import { defaultSettings, normalizeSettings } from "./settings.js";
import { syncArchive } from "./archive.js";
import type { ArchiveSettings, RuntimeStatus, SyncResult } from "./types.js";

const syncNowCommand = "markdownArchive.syncNow";
const openOutputDirectoryCommand = "markdownArchive.openOutputDirectory";

class MarkdownArchiveRuntime {
  private settings: ArchiveSettings = defaultSettings;
  private timer: NodeJS.Timeout | null = null;
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
      default:
        throw new Error(`Unsupported command: ${commandId}`);
    }
  }

  async getStatus() {
    return this.status();
  }

  private async runSync(mode: "manual" | "auto") {
    if (this.syncRunning) {
      return {
        status: "skipped",
        message: "A sync is already running."
      };
    }
    if (mode === "auto" && (!this.settings.archiveEnabled || !this.settings.autoSync)) {
      return {
        status: "skipped",
        message: "Auto sync is disabled."
      };
    }

    this.syncRunning = true;
    this.lastRun = new Date().toISOString();
    try {
      const result = await syncArchive(this.settings);
      this.applySyncResult(result);
      if (result.status === "failed") {
        this.lastError = result.failures[0]?.error ?? "Sync failed.";
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
        message: `Exported ${result.exportedCount}, skipped ${result.skippedCount}, failed ${result.failedCount}.`,
        result
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : "Sync failed.";
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
        message: "Output directory is not configured."
      };
    }

    const opener = openerCommand();
    if (!opener) {
      return {
        status: "failed",
        message: `Open output directory is not supported on ${process.platform}.`
      };
    }

    const child = spawn(opener.command, [...opener.args, this.settings.outputDirectory], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
    return {
      status: "success",
      message: "Output directory opened."
    };
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

function objectValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function main() {
  const mode = process.argv[2] ?? "serve";
  if (mode !== "serve") {
    process.stderr.write("Usage: relay-switch-plugin-markdown-archive serve\n");
    process.exitCode = 2;
    return;
  }

  const runtime = new MarkdownArchiveRuntime();
  const server = new JsonRpcServer();
  server.register("initialize", (params) => runtime.initialize(params));
  server.register("shutdown", (params) => runtime.shutdown());
  server.register("settingsChanged", (params) => runtime.settingsChanged(params));
  server.register("executeCommand", (params) => runtime.executeCommand(params));
  server.register("getStatus", (params) => runtime.getStatus());
  server.start();
  log("runtime started");
}

main();
