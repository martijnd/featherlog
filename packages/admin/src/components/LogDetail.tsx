import { useEffect, useId, useRef, useState } from "react";
import { LogEntry } from "../api/client";
import ShareLinkPanel from "./ShareLinkPanel";
import CopyPermalinkButton from "./CopyPermalinkButton";
import { logPermalink } from "../permalink";
import { levelBadgeClass } from "../ui";

interface LogDetailProps {
  log: LogEntry;
  onClose: () => void;
  /** Public share page: inline layout, no share/close actions */
  variant?: "modal" | "page";
  /** When false, hide the share control (e.g. anonymous public viewers). */
  showShare?: boolean;
}

interface JsonViewerProps {
  data: any;
  level?: number;
}

function JsonViewer({ data, level = 0 }: JsonViewerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const indent = level * 20;
  const uniqueKey = `json-${level}-${JSON.stringify(data).substring(0, 20)}`;

  const toggleExpand = () => {
    const newExpanded = new Set(expanded);
    if (newExpanded.has(uniqueKey)) {
      newExpanded.delete(uniqueKey);
    } else {
      newExpanded.add(uniqueKey);
    }
    setExpanded(newExpanded);
  };

  const isExpanded = expanded.has(uniqueKey);

  if (data === null || data === undefined) {
    return <span className="json-muted" style={{ fontStyle: "italic" }}>null</span>;
  }

  if (typeof data === "string") {
    return <span className="json-string">"{data}"</span>;
  }

  if (typeof data === "number") {
    return <span className="json-number">{data}</span>;
  }

  if (typeof data === "boolean") {
    return <span className="json-bool">{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="json-muted">[]</span>;
    }
    return (
      <div style={{ marginLeft: `${indent}px` }}>
        <button type="button" className="json-toggle" onClick={toggleExpand}>
          {isExpanded ? "▼" : "▶"} [
        </button>
        {isExpanded && (
          <div style={{ marginLeft: "20px" }}>
            {data.map((item, index) => (
              <div key={index} style={{ marginBottom: "4px" }}>
                <span className="json-muted">{index}: </span>
                <JsonViewer data={item} level={level + 1} />
                {index < data.length - 1 && (
                  <span className="json-muted">,</span>
                )}
              </div>
            ))}
          </div>
        )}
        {!isExpanded && (
          <span className="json-muted"> {data.length} items</span>
        )}
        <span className="json-muted">]</span>
      </div>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <span className="json-muted">{"{}"}</span>;
    }
    return (
      <div style={{ marginLeft: `${indent}px` }}>
        <button type="button" className="json-toggle" onClick={toggleExpand}>
          {isExpanded ? "▼" : "▶"} {"{"}
        </button>
        {isExpanded && (
          <div style={{ marginLeft: "20px" }}>
            {keys.map((k, index) => (
              <div key={k} style={{ marginBottom: "4px" }}>
                <span className="json-key">"{k}"</span>
                <span className="json-muted">: </span>
                <JsonViewer data={data[k]} level={level + 1} />
                {index < keys.length - 1 && (
                  <span className="json-muted">,</span>
                )}
              </div>
            ))}
          </div>
        )}
        {!isExpanded && (
          <span className="json-muted"> {keys.length} keys</span>
        )}
        <span className="json-muted">{"}"}</span>
      </div>
    );
  }

  return <span>{String(data)}</span>;
}

export default function LogDetail({
  log,
  onClose,
  variant = "modal",
  showShare = true,
}: LogDetailProps) {
  const isPage = variant === "page";
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (isPage) return;

    const dialog = dialogRef.current;
    const parent = dialog?.parentElement;
    const siblings = parent
      ? Array.from(parent.children).filter((child) => child !== dialog)
      : [];
    for (const sibling of siblings) {
      sibling.setAttribute("inert", "");
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      for (const sibling of siblings) {
        sibling.removeAttribute("inert");
      }
      previouslyFocused?.focus();
    };
  }, [isPage]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      full: date.toLocaleString(undefined, {
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      iso: date.toISOString(),
      relative: getRelativeTime(date),
    };
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60)
      return `${diffSecs} second${diffSecs !== 1 ? "s" : ""} ago`;
    if (diffMins < 60)
      return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24)
      return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
  };

  const dateInfo = formatDate(log.timestamp);
  const metadata = log.metadata || {};
  const metadataKeys = Object.keys(metadata);

  const errorObj =
    metadata.error && typeof metadata.error === "object"
      ? (metadata.error as Record<string, unknown>)
      : null;
  const stack =
    (errorObj && typeof errorObj.stack === "string" && errorObj.stack) ||
    (typeof metadata.stack === "string" ? metadata.stack : null);

  const contextRows: { label: string; value: string }[] = [];
  const pushContext = (label: string, value: unknown) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "object") {
      contextRows.push({ label, value: JSON.stringify(value) });
    } else {
      contextRows.push({ label, value: String(value) });
    }
  };

  pushContext("request_id", metadata.request_id);
  pushContext("trace_id", metadata.trace_id);
  pushContext("service", metadata.service);
  pushContext("version", metadata.version);
  pushContext("environment", metadata.environment);
  pushContext("outcome", metadata.outcome);
  pushContext("status_code", metadata.status_code);
  pushContext("duration_ms", metadata.duration_ms);
  pushContext("method", metadata.method);
  pushContext("path", metadata.path);
  if (metadata.user && typeof metadata.user === "object") {
    pushContext("user", metadata.user);
  } else {
    pushContext("user_id", metadata.user_id ?? metadata.userId);
  }
  if (log.fingerprint) {
    pushContext("fingerprint", log.fingerprint);
  }

  return (
    <div
      ref={dialogRef}
      className={`log-detail${isPage ? "" : " is-modal"}`}
      {...(!isPage
        ? {
            role: "dialog",
            "aria-modal": true,
            "aria-labelledby": titleId,
            tabIndex: -1,
          }
        : {})}
    >
      <div className="log-detail-header">
        <div className="u-flex-1">
          <div className="log-detail-meta">
            <span className={levelBadgeClass(log.level)}>{log.level}</span>
            <span className="u-text-sm u-text-muted">Log ID: {log.id}</span>
          </div>
          <h2 id={titleId} className="log-detail-title">
            {log.message}
          </h2>
        </div>
        {!isPage && (
          <div className="log-detail-actions">
            {showShare && (
              <>
                <CopyPermalinkButton url={logPermalink(log.id)} />
                <ShareLinkPanel request={{ type: "log", logId: log.id }} />
              </>
            )}
            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div className="log-detail-body">
        <div className="log-detail-section">
          <h3 className="panel-section-title">Basic information</h3>
          <div className="panel-body-muted">
            <div className="meta-grid">
              <div className="meta-row">
                <span className="meta-label">Project ID</span>
                <code className="code-block">{log["project-id"]}</code>
              </div>
              <div className="meta-row">
                <span className="meta-label">Timestamp</span>
                <div>
                  <div>{dateInfo.full}</div>
                  <div className="u-text-sm u-text-muted u-mt-sm">
                    {dateInfo.relative} · {dateInfo.iso}
                  </div>
                </div>
              </div>
              <div className="meta-row">
                <span className="meta-label">Level</span>
                <span className={levelBadgeClass(log.level)}>{log.level}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="log-detail-section">
          <h3 className="panel-section-title">Message</h3>
          <div className="message-block">{log.message}</div>
        </div>

        {contextRows.length > 0 && (
          <div className="log-detail-section">
            <h3 className="panel-section-title">Event context</h3>
            <div className="panel-body-muted context-grid">
              {contextRows.map((row) => (
                <div key={row.label}>
                  <div className="context-item-label">{row.label}</div>
                  <code className="code-block">{row.value}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {stack && (
          <div className="log-detail-section">
            <h3 className="panel-section-title">
              Stack trace
              {errorObj?.name ? ` — ${String(errorObj.name)}` : ""}
            </h3>
            <pre className="stack-block">{stack}</pre>
          </div>
        )}

        {metadataKeys.length > 0 ? (
          <div className="log-detail-section">
            <h3 className="panel-section-title">
              Metadata ({metadataKeys.length}{" "}
              {metadataKeys.length === 1 ? "key" : "keys"})
            </h3>
            <div className="json-viewer">
              <JsonViewer data={log.metadata} />
            </div>
          </div>
        ) : (
          <div className="log-detail-section">
            <h3 className="panel-section-title">Metadata</h3>
            <div className="panel-body-muted empty-state" style={{ padding: "1rem" }}>
              No metadata available
            </div>
          </div>
        )}
      </div>

      {!isPage && (
        <div className="log-detail-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
