# Relay Switch Markdown 归档插件

Relay Switch 官方插件，用于将本地 AI 工具会话记录导出为适合 Obsidian 使用的 Markdown。

## 读取内容

- `~/.claude/projects/**/*.jsonl` 下的 Claude Code 会话记录
- `~/.codex/sessions/**/*.jsonl` 下的 Codex CLI 会话记录
- `~/.codex/archived_sessions/**/*.jsonl` 下的 Codex CLI 归档会话记录

当前版本会直接读取本地会话文件。未来可以由 Relay Switch Transcript Broker 替代这类直接文件访问。

## 隐私说明

会话归档会读取本地助手会话记录，并将完整提示词、回复、代码片段、工具输出以及可能存在的敏感信息写入 Markdown 文件。请只为你信任的输出目录启用这个插件。

`redactSecrets` 设置会尽力隐藏常见 API Key 和 token 形式的敏感信息，但它不是完整的数据防泄漏系统。

## 运行方式

Relay Switch manifest 使用受控的 `nodePackage` 入口：

```json
{
  "type": "nodePackage",
  "package": "@relay-switch/plugin-markdown-archive",
  "version": "0.1.0-alpha.0",
  "bin": "relay-switch-plugin-markdown-archive",
  "args": ["serve"]
}
```

Relay Switch 会通过 stdio JSON-RPC 启动插件运行时。

## 本地会话浏览器

这个仓库也可以作为独立 localhost 服务使用，用来浏览 Claude Code 和 Codex CLI 历史会话。

从源码仓库启动：

```bash
git clone https://github.com/relay-switch/plugin-markdown-archive.git
cd plugin-markdown-archive
pnpm install
pnpm start
```

打开终端输出的 localhost 地址。也可以使用 `pnpm start:open` 自动打开浏览器。

npm 包发布后可以这样启动：

```bash
npx @relay-switch/plugin-markdown-archive@0.1.0-alpha.0 web --open
```

Relay Switch 命令 `markdownArchive.openBrowser` 会从插件运行时启动同一个浏览器服务。服务绑定到 `127.0.0.1`，默认端口是 `43178`；可以设置 `MARKDOWN_ARCHIVE_BROWSER_PORT` 指定其他端口。

## 开发

```bash
pnpm install
pnpm build
pnpm test
```

本地运行时冒烟测试：

```bash
node dist/main.js serve
```

首次发布集成构建需要拥有 `@relay-switch` scope 的 npm 发布权限：

```bash
npm publish --access public --tag alpha
```
