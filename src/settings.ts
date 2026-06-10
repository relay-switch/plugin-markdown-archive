import type { ArchiveSettings } from "./types.js";

export const defaultSettings: ArchiveSettings = {
  archiveEnabled: true,
  outputDirectory: "",
  includeClaudeCode: true,
  includeCodexCLI: true,
  autoSync: true,
  syncIntervalSeconds: 300,
  includeSystemEvents: false,
  includeToolCalls: true,
  redactSecrets: true,
  overwriteExisting: true
};

export function normalizeSettings(input: unknown): ArchiveSettings {
  const values = isObject(input) ? input : {};
  const interval = numberValue(values.syncIntervalSeconds, defaultSettings.syncIntervalSeconds);
  return {
    archiveEnabled: booleanValue(values.archiveEnabled, defaultSettings.archiveEnabled),
    outputDirectory: stringValue(values.outputDirectory, defaultSettings.outputDirectory).trim(),
    includeClaudeCode: booleanValue(values.includeClaudeCode, defaultSettings.includeClaudeCode),
    includeCodexCLI: booleanValue(values.includeCodexCLI, defaultSettings.includeCodexCLI),
    autoSync: booleanValue(values.autoSync, defaultSettings.autoSync),
    syncIntervalSeconds: Math.max(30, Math.floor(interval)),
    includeSystemEvents: booleanValue(values.includeSystemEvents, defaultSettings.includeSystemEvents),
    includeToolCalls: booleanValue(values.includeToolCalls, defaultSettings.includeToolCalls),
    redactSecrets: booleanValue(values.redactSecrets, defaultSettings.redactSecrets),
    overwriteExisting: booleanValue(values.overwriteExisting, defaultSettings.overwriteExisting)
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
