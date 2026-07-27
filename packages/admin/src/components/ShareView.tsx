import { useEffect, useState } from "react";
import {
  apiClient,
  Issue,
  LogEntry,
  SharePayload,
} from "../api/client";
import LogDetail from "./LogDetail";
import RelativeTime from "./RelativeTime";
import { issueStatusBadgeClass, levelBadgeClass } from "../ui";
import { formatAbsoluteDate } from "../time";

function getErrorName(issue: Issue) {
  const error = issue.latest_metadata?.error;
  if (error && typeof error === "object" && typeof error.name === "string") {
    return error.name;
  }
  return "Error";
}

function IssueShareDetail({
  issue,
  logs,
  expiresAt,
}: {
  issue: Issue;
  logs: LogEntry[];
  expiresAt: string;
}) {
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);

  return (
    <div className="share-page">
      <div className="u-mb-md">
        <div className="share-kicker">Featherlog · Shared issue</div>
        <div
          className="u-flex-center u-gap-md"
          style={{ marginBottom: "0.75rem", flexWrap: "wrap" }}
        >
          <span className={levelBadgeClass(issue.level)}>
            {getErrorName(issue)}
          </span>
          <span className={issueStatusBadgeClass(issue.status)}>
            {issue.status}
          </span>
          <span className="u-text-sm u-text-muted">
            {issue.count} occurrence{issue.count === 1 ? "" : "s"} · project{" "}
            <code>{issue["project-id"]}</code>
          </span>
        </div>
        <h1
          style={{
            margin: "0 0 0.5rem",
            fontSize: "1.35rem",
            fontWeight: 600,
            wordBreak: "break-word",
            letterSpacing: "-0.01em",
          }}
        >
          {issue.message}
        </h1>
        <div className="u-text-sm u-text-muted">
          <code>{issue.fingerprint}</code>
          <span style={{ margin: "0 0.5rem" }}>·</span>
          First seen <RelativeTime value={issue.first_seen} />
          <span style={{ margin: "0 0.5rem" }}>·</span>
          Last seen <RelativeTime value={issue.last_seen} />
          <span style={{ margin: "0 0.5rem" }}>·</span>
          Link expires {formatAbsoluteDate(expiresAt)}
        </div>
      </div>

      <div className="panel panel-flush">
        <div className="panel-header">Recent occurrences</div>
        {logs.length === 0 ? (
          <div className="empty-state" style={{ padding: "1.25rem" }}>
            No occurrences
          </div>
        ) : (
          <ul className="occurrence-list">
            {logs.map((log) => (
              <li
                key={log.id}
                className="occurrence-item is-clickable"
                onClick={() => setSelectedLog(log)}
              >
                <RelativeTime value={log.timestamp} />
                <span className="cell-mono">#{log.id}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selectedLog && (
        <LogDetail
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
          showShare={false}
        />
      )}
    </div>
  );
}

export default function ShareView({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SharePayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await apiClient.getShare(token);
        if (!cancelled) setPayload(data);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Share link not found"
          );
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div
        className="empty-state share-scroll"
        style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        Loading shared log…
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="empty-state share-scroll" style={{ display: "flex", alignItems: "center" }}>
        <div style={{ textAlign: "center", maxWidth: 420, margin: "0 auto" }}>
          <div className="share-kicker">Featherlog</div>
          <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.35rem" }}>
            Link unavailable
          </h1>
          <p className="u-text-muted" style={{ margin: 0 }}>
            {error ||
              "This share link is missing, expired, or has been revoked."}
          </p>
        </div>
      </div>
    );
  }

  if (payload.type === "log") {
    return (
      <div className="share-scroll" style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="share-banner">
          <span>
            <strong style={{ color: "var(--text-secondary)" }}>Featherlog</strong>{" "}
            · Shared log
          </span>
          <span>Link expires {formatAbsoluteDate(payload.expires_at)}</span>
        </div>
        <LogDetail
          log={payload.log}
          onClose={() => {}}
          variant="page"
          showShare={false}
        />
      </div>
    );
  }

  return (
    <IssueShareDetail
      issue={payload.issue}
      logs={payload.logs}
      expiresAt={payload.expires_at}
    />
  );
}
