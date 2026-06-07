import { useCallback, useEffect, useMemo, useState, useDeferredValue } from "react";
import {
  Bot,
  CircleAlert,
  Code2,
  FileText,
  LoaderCircle,
  RefreshCw,
  Search,
  SlidersHorizontal,
  TerminalSquare,
  UserRound,
  Wrench
} from "lucide-react";
import type { Role, SessionDetail, SessionDetailResponse, SessionsResponse, SessionSummary, SourceID, SyncResult } from "./types";

type SourceFilter = SourceID | "all";

const sourceOptions: Array<{ id: SourceFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "claude-code", label: "Claude" },
  { id: "codex-cli", label: "Codex" }
];

export function App() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [projects, setProjects] = useState<string[]>([]);
  const [errors, setErrors] = useState<SessionsResponse["errors"]>([]);
  const [source, setSource] = useState<SourceFilter>("all");
  const [project, setProject] = useState("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);

  const loadSessions = useCallback(async (signal?: AbortSignal) => {
    setLoadingList(true);
    setListError("");
    const params = new URLSearchParams();
    if (source !== "all") {
      params.set("source", source);
    }
    if (project !== "all") {
      params.set("project", project);
    }
    if (deferredQuery.trim()) {
      params.set("q", deferredQuery.trim());
    }
    const response = await fetch("/api/sessions?" + params.toString(), { signal });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json() as SessionsResponse;
    setSessions(data.items);
    setProjects(data.projects);
    setErrors(data.errors);
    setSelectedId((current) => data.items.some((item) => item.id === current) ? current : data.items[0]?.id || "");
    setLoadingList(false);
  }, [deferredQuery, project, source]);

  useEffect(() => {
    const controller = new AbortController();
    loadSessions(controller.signal).catch((error) => {
      if (!controller.signal.aborted) {
        setLoadingList(false);
        setListError(error instanceof Error ? error.message : "Failed to load sessions.");
      }
    });
    return () => controller.abort();
  }, [loadSessions, refreshToken]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setMarkdown("");
      return;
    }
    const controller = new AbortController();
    setLoadingDetail(true);
    setDetailError("");
    fetch("/api/sessions/" + encodeURIComponent(selectedId), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return response.json() as Promise<SessionDetailResponse>;
      })
      .then((data) => {
        setDetail(data.session);
        setMarkdown(data.markdown);
        setLoadingDetail(false);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoadingDetail(false);
          setDetailError(error instanceof Error ? error.message : "Failed to load session.");
        }
      });
    return () => controller.abort();
  }, [selectedId]);

  const selectedSummary = useMemo(() => sessions.find((item) => item.id === selectedId), [selectedId, sessions]);
  const metrics = useMemo(() => ({
    total: sessions.length,
    claude: sessions.filter((item) => item.source === "claude-code").length,
    codex: sessions.filter((item) => item.source === "codex-cli").length
  }), [sessions]);

  async function syncNow() {
    setSyncing(true);
    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const result = await response.json() as SyncResult;
      setSyncResult(result);
      setRefreshToken((value) => value + 1);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="product-mark"><FileText size={20} /> Markdown Archive</div>
          <h1>Conversation Browser</h1>
        </div>
        <div className="topbar-actions">
          <button className="icon-button" onClick={() => setRefreshToken((value) => value + 1)} aria-label="Refresh sessions" title="Refresh sessions">
            <RefreshCw size={18} />
          </button>
          <button className="primary-button" onClick={syncNow} disabled={syncing}>
            {syncing ? <LoaderCircle className="spin" size={18} /> : <RefreshCw size={18} />}
            Sync now
          </button>
        </div>
      </header>

      <section className="metrics-strip" aria-label="Session metrics">
        <Metric label="Visible" value={metrics.total} />
        <Metric label="Claude" value={metrics.claude} />
        <Metric label="Codex" value={metrics.codex} />
        <Metric label="Parse errors" value={errors.length} tone={errors.length > 0 ? "warn" : "neutral"} />
      </section>

      <main className="content-grid">
        <aside className="session-pane" aria-label="Conversation list">
          <div className="filter-row">
            <label className="search-box">
              <Search size={17} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search conversations" />
            </label>
          </div>

          <div className="segmented" aria-label="Source filter">
            {sourceOptions.map((option) => (
              <button key={option.id} className={source === option.id ? "active" : ""} onClick={() => setSource(option.id)}>
                {option.label}
              </button>
            ))}
          </div>

          <label className="select-label">
            <SlidersHorizontal size={16} />
            <select value={project} onChange={(event) => setProject(event.target.value)}>
              <option value="all">All projects</option>
              {projects.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>

          {listError ? <InlineError text={listError} /> : null}
          <div className="session-list">
            {loadingList ? <LoadingRows /> : null}
            {!loadingList && sessions.length === 0 ? <EmptyState text="No sessions found" /> : null}
            {!loadingList && sessions.map((session) => (
              <button key={session.id} className={"session-card " + (session.id === selectedId ? "selected" : "")} onClick={() => setSelectedId(session.id)}>
                <div className="session-card-topline">
                  <span className={"source-pill " + session.source}>{sourceLabel(session.source)}</span>
                  <span>{formatDate(session.updatedAt)}</span>
                </div>
                <strong>{session.title}</strong>
                <span className="session-project">{session.projectName}</span>
                <p>{session.preview || "No text content"}</p>
                <div className="session-card-meta">
                  <span>{session.messageCount} messages</span>
                  <span>{formatBytes(session.rawSize)}</span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="reader-pane" aria-label="Conversation detail">
          {syncResult ? <SyncBanner result={syncResult} /> : null}
          {detailError ? <InlineError text={detailError} /> : null}
          {!selectedId && !loadingList ? <EmptyState text="No conversation selected" /> : null}
          {loadingDetail ? <ReaderLoading /> : null}
          {!loadingDetail && detail ? <ConversationDetail detail={detail} markdown={markdown} summary={selectedSummary} /> : null}
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "warn" }) {
  return <div className={"metric " + tone}><span>{label}</span><strong>{value}</strong></div>;
}

function ConversationDetail({ detail, markdown, summary }: { detail: SessionDetail; markdown: string; summary?: SessionSummary }) {
  return (
    <article className="conversation-detail">
      <div className="reader-header">
        <div>
          <div className="reader-meta">
            <span className={"source-pill " + detail.source}>{sourceLabel(detail.source)}</span>
            <span>{detail.projectName}</span>
            <span>{formatDate(detail.updatedAt)}</span>
          </div>
          <h2>{detail.title}</h2>
          <p>{detail.rawPath}</p>
        </div>
        <div className="reader-counts" aria-label="Message role counts">
          <RoleCount role="user" count={summary?.roleCounts.user || 0} />
          <RoleCount role="assistant" count={summary?.roleCounts.assistant || 0} />
          <RoleCount role="tool" count={summary?.roleCounts.tool || 0} />
        </div>
      </div>

      <div className="message-stack">
        {detail.messages.map((message, index) => (
          <MessageBlock key={String(index) + message.timestamp + message.role} message={message} />
        ))}
      </div>

      <details className="markdown-panel">
        <summary>Rendered Markdown</summary>
        <pre>{markdown}</pre>
      </details>
    </article>
  );
}

function MessageBlock({ message }: { message: SessionDetail["messages"][number] }) {
  return (
    <section className={"message-block " + message.role}>
      <header>
        <span>{roleIcon(message.role)} {roleLabel(message.role)}</span>
        {message.timestamp ? <time>{formatDate(message.timestamp)}</time> : null}
      </header>
      <pre>{message.text || "No text content"}</pre>
    </section>
  );
}

function RoleCount({ role, count }: { role: Role; count: number }) {
  return <span><span className={"role-dot " + role}></span>{roleLabel(role)} {count}</span>;
}

function SyncBanner({ result }: { result: SyncResult }) {
  return (
    <div className={"sync-banner " + result.status}>
      <strong>{result.status}</strong>
      <span>Exported {result.exportedCount}, skipped {result.skippedCount}, failed {result.failedCount}</span>
    </div>
  );
}

function InlineError({ text }: { text: string }) {
  return <div className="inline-error"><CircleAlert size={16} /> <span>{text}</span></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function LoadingRows() {
  return <div className="loading-list"><span></span><span></span><span></span><span></span></div>;
}

function ReaderLoading() {
  return <div className="reader-loading"><LoaderCircle className="spin" size={22} /> Loading</div>;
}

function sourceLabel(source: SourceID) {
  return source === "claude-code" ? "Claude Code" : "Codex CLI";
}

function roleLabel(role: Role) {
  switch (role) {
    case "user":
      return "User";
    case "assistant":
      return "Assistant";
    case "tool":
      return "Tool";
    case "system":
      return "System";
    default:
      return "Event";
  }
}

function roleIcon(role: Role) {
  switch (role) {
    case "user":
      return <UserRound size={16} />;
    case "assistant":
      return <Bot size={16} />;
    case "tool":
      return <Wrench size={16} />;
    case "system":
      return <TerminalSquare size={16} />;
    default:
      return <Code2 size={16} />;
  }
}

function formatDate(value: string) {
  if (!value) {
    return "Unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatBytes(value: number) {
  if (value < 1024) {
    return value + " B";
  }
  if (value < 1024 * 1024) {
    return Math.round(value / 1024) + " KB";
  }
  return (value / 1024 / 1024).toFixed(1) + " MB";
}
