import { useEffect, useState } from "react";
import {
  apiClient,
  Issue,
  LogEntry,
  SharePayload,
} from "../api/client";
import LogDetail from "./LogDetail";

function getLevelColor(level: string) {
  switch (level) {
    case "error":
      return "#dc3545";
    case "warn":
      return "#ffc107";
    case "info":
      return "#17a2b8";
    default:
      return "#6c757d";
  }
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString(undefined, {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

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
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        maxWidth: "900px",
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            fontSize: "0.85rem",
            fontWeight: 600,
            color: "#6c757d",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}
        >
          Featherlog · Shared issue
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            marginBottom: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              display: "inline-block",
              padding: "0.35rem 0.75rem",
              borderRadius: "4px",
              backgroundColor: getLevelColor(issue.level),
              color: "white",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {getErrorName(issue)}
          </span>
          <span style={{ fontSize: "0.85rem", color: "#6c757d" }}>
            {issue.count} occurrence{issue.count === 1 ? "" : "s"} · project{" "}
            <code>{issue["project-id"]}</code>
          </span>
        </div>
        <h1
          style={{
            margin: "0 0 0.5rem 0",
            fontSize: "1.5rem",
            fontWeight: 600,
            color: "#212529",
            wordBreak: "break-word",
          }}
        >
          {issue.message}
        </h1>
        <div style={{ fontSize: "0.85rem", color: "#6c757d" }}>
          <code>{issue.fingerprint}</code>
          <span style={{ margin: "0 0.5rem" }}>·</span>
          First seen {formatDate(issue.first_seen)}
          <span style={{ margin: "0 0.5rem" }}>·</span>
          Last seen {formatDate(issue.last_seen)}
          <span style={{ margin: "0 0.5rem" }}>·</span>
          Link expires {formatDate(expiresAt)}
        </div>
      </div>

      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "0.75rem 1rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            color: "#495057",
            borderBottom: "1px solid #dee2e6",
            backgroundColor: "#f8f9fa",
          }}
        >
          Recent occurrences
        </div>
        {logs.length === 0 ? (
          <div style={{ padding: "1.25rem", color: "#6c757d" }}>
            No occurrences
          </div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {logs.map((log, index) => (
              <li
                key={log.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  padding: "0.75rem 1rem",
                  borderBottom:
                    index < logs.length - 1 ? "1px solid #eee" : "none",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
                onClick={() => setSelectedLog(log)}
                onMouseOver={(e) => {
                  e.currentTarget.style.backgroundColor = "#f8f9fa";
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span>{formatDate(log.timestamp)}</span>
                <span style={{ color: "#6c757d", fontFamily: "monospace" }}>
                  #{log.id}
                </span>
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
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#6c757d",
        }}
      >
        Loading shared log…
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "420px" }}>
          <div
            style={{
              fontSize: "0.85rem",
              fontWeight: 600,
              color: "#6c757d",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
            }}
          >
            Featherlog
          </div>
          <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.5rem" }}>
            Link unavailable
          </h1>
          <p style={{ margin: 0, color: "#6c757d" }}>
            {error || "This share link is missing, expired, or has been revoked."}
          </p>
        </div>
      </div>
    );
  }

  if (payload.type === "log") {
    return (
      <div style={{ minHeight: "100vh", maxWidth: "900px", margin: "0 auto" }}>
        <div
          style={{
            padding: "0.75rem 1.5rem",
            borderBottom: "1px solid #e9ecef",
            backgroundColor: "#f8f9fa",
            fontSize: "0.85rem",
            color: "#6c757d",
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span>
            <strong style={{ color: "#495057" }}>Featherlog</strong> · Shared
            log
          </span>
          <span>Link expires {formatDate(payload.expires_at)}</span>
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
