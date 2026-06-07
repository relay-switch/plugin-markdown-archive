# Relay Switch Markdown Archive Plugin

Official Relay Switch plugin for exporting local AI tool transcripts to Obsidian-friendly Markdown.

## What It Reads

- Claude Code transcripts under `~/.claude/projects/**/*.jsonl`
- Codex CLI transcripts under `~/.codex/sessions/**/*.jsonl`
- Codex CLI archived transcripts under `~/.codex/archived_sessions/**/*.jsonl`

The plugin reads transcript files directly in v1. A future Relay Switch Transcript Broker can replace this direct file access.

## Privacy Notice

Conversation archive reads local assistant transcripts and writes full prompts, responses, code snippets, tool outputs, and possible secrets to Markdown files. Only enable this for directories you trust.

The `redactSecrets` setting applies best-effort redaction for common API key and token patterns. It is not a complete data-loss-prevention system.

## Runtime

The Relay Switch manifest uses a controlled `nodePackage` entry:

```json
{
  "type": "nodePackage",
  "package": "@relay-switch/plugin-markdown-archive",
  "version": "0.1.0-alpha.0",
  "bin": "relay-switch-plugin-markdown-archive",
  "args": ["serve"]
}
```

Relay Switch starts the runtime over stdio JSON-RPC.

## Development

```bash
pnpm install
pnpm build
pnpm test
```

Local runtime smoke test:

```bash
node dist/main.js serve
```

Publishing the first integration build requires npm access to the `@relay-switch` scope:

```bash
npm publish --access public --tag alpha
```
