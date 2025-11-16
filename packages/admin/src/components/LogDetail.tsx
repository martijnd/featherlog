import { useState } from "react";
import { LogEntry } from "../api/client";

interface LogDetailProps {
  log: LogEntry;
  onClose: () => void;
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
    return <span style={{ color: "#6c757d", fontStyle: "italic" }}>null</span>;
  }

  if (typeof data === "string") {
    return <span style={{ color: "#28a745" }}>"{data}"</span>;
  }

  if (typeof data === "number") {
    return <span style={{ color: "#007bff" }}>{data}</span>;
  }

  if (typeof data === "boolean") {
    return <span style={{ color: "#6f42c1" }}>{String(data)}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span style={{ color: "#6c757d" }}>[]</span>;
    }
    return (
      <div style={{ marginLeft: `${indent}px` }}>
        <span
          onClick={toggleExpand}
          style={{
            cursor: "pointer",
            userSelect: "none",
            color: "#6c757d",
            fontWeight: "500",
          }}
        >
          {isExpanded ? "▼" : "▶"} [
        </span>
        {isExpanded && (
          <div style={{ marginLeft: "20px" }}>
            {data.map((item, index) => (
              <div key={index} style={{ marginBottom: "4px" }}>
                <span style={{ color: "#6c757d" }}>{index}: </span>
                <JsonViewer data={item} level={level + 1} />
                {index < data.length - 1 && (
                  <span style={{ color: "#6c757d" }}>,</span>
                )}
              </div>
            ))}
          </div>
        )}
        {!isExpanded && (
          <span style={{ color: "#6c757d" }}> {data.length} items</span>
        )}
        <span style={{ color: "#6c757d" }}>]</span>
      </div>
    );
  }

  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return <span style={{ color: "#6c757d" }}>{"{}"}</span>;
    }
    return (
      <div style={{ marginLeft: `${indent}px` }}>
        <span
          onClick={toggleExpand}
          style={{
            cursor: "pointer",
            userSelect: "none",
            color: "#6c757d",
            fontWeight: "500",
          }}
        >
          {isExpanded ? "▼" : "▶"} {"{"}
        </span>
        {isExpanded && (
          <div style={{ marginLeft: "20px" }}>
            {keys.map((k, index) => (
              <div key={k} style={{ marginBottom: "4px" }}>
                <span style={{ color: "#e83e8c", fontWeight: "500" }}>
                  "{k}"
                </span>
                <span style={{ color: "#6c757d" }}>: </span>
                <JsonViewer data={data[k]} level={level + 1} />
                {index < keys.length - 1 && (
                  <span style={{ color: "#6c757d" }}>,</span>
                )}
              </div>
            ))}
          </div>
        )}
        {!isExpanded && (
          <span style={{ color: "#6c757d" }}> {keys.length} keys</span>
        )}
        <span style={{ color: "#6c757d" }}>{"}"}</span>
      </div>
    );
  }

  return <span>{String(data)}</span>;
}

export default function LogDetail({ log, onClose }: LogDetailProps) {
  const getLevelColor = (level: string) => {
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
  };

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
  const metadataKeys = Object.keys(log.metadata || {});

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "white",
        zIndex: 2000,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "1.5rem",
          borderBottom: "2px solid #e9ecef",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "0.5rem",
            }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "0.5rem 1rem",
                borderRadius: "6px",
                backgroundColor: getLevelColor(log.level),
                color: "white",
                fontSize: "0.875rem",
                fontWeight: "600",
              }}
            >
              {log.level.toUpperCase()}
            </span>
            <span style={{ fontSize: "0.875rem", color: "#6c757d" }}>
              Log ID: {log.id}
            </span>
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: "1.5rem",
              fontWeight: "600",
              color: "#212529",
              wordBreak: "break-word",
            }}
          >
            {log.message}
          </h2>
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: "1.5rem",
            cursor: "pointer",
            color: "#6c757d",
            padding: "0.25rem 0.5rem",
            lineHeight: "1",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.color = "#212529";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.color = "#6c757d";
          }}
        >
          ×
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: "1.5rem", flex: 1, overflow: "auto" }}>
        {/* Basic Information */}
        <div style={{ marginBottom: "2rem" }}>
          <h3
            style={{
              margin: "0 0 1rem 0",
              fontSize: "1rem",
              fontWeight: "600",
              color: "#495057",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Basic Information
          </h3>
          <div
            style={{
              backgroundColor: "#f8f9fa",
              borderRadius: "8px",
              padding: "1rem",
            }}
          >
            <div style={{ display: "grid", gap: "0.75rem" }}>
              <div style={{ display: "flex", gap: "1rem" }}>
                <span
                  style={{
                    fontWeight: "600",
                    color: "#6c757d",
                    minWidth: "120px",
                  }}
                >
                  Project ID:
                </span>
                <code
                  style={{
                    backgroundColor: "#e9ecef",
                    padding: "0.25rem 0.5rem",
                    borderRadius: "4px",
                    fontSize: "0.875rem",
                  }}
                >
                  {log["project-id"]}
                </code>
              </div>
              <div style={{ display: "flex", gap: "1rem" }}>
                <span
                  style={{
                    fontWeight: "600",
                    color: "#6c757d",
                    minWidth: "120px",
                  }}
                >
                  Timestamp:
                </span>
                <div>
                  <div>{dateInfo.full}</div>
                  <div
                    style={{
                      fontSize: "0.875rem",
                      color: "#6c757d",
                      marginTop: "0.25rem",
                    }}
                  >
                    {dateInfo.relative} • {dateInfo.iso}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: "1rem" }}>
                <span
                  style={{
                    fontWeight: "600",
                    color: "#6c757d",
                    minWidth: "120px",
                  }}
                >
                  Level:
                </span>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0.25rem 0.75rem",
                    borderRadius: "4px",
                    backgroundColor: getLevelColor(log.level),
                    color: "white",
                    fontSize: "0.875rem",
                    fontWeight: "500",
                  }}
                >
                  {log.level.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Message */}
        <div style={{ marginBottom: "2rem" }}>
          <h3
            style={{
              margin: "0 0 1rem 0",
              fontSize: "1rem",
              fontWeight: "600",
              color: "#495057",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Message
          </h3>
          <div
            style={{
              backgroundColor: "#f8f9fa",
              borderRadius: "8px",
              padding: "1rem",
              fontFamily: "monospace",
              fontSize: "0.9rem",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {log.message}
          </div>
        </div>

        {/* Metadata */}
        {metadataKeys.length > 0 ? (
          <div>
            <h3
              style={{
                margin: "0 0 1rem 0",
                fontSize: "1rem",
                fontWeight: "600",
                color: "#495057",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Metadata ({metadataKeys.length}{" "}
              {metadataKeys.length === 1 ? "key" : "keys"})
            </h3>
            <div
              style={{
                backgroundColor: "#f8f9fa",
                borderRadius: "8px",
                padding: "1rem",
                fontFamily: "monospace",
                fontSize: "0.875rem",
                overflow: "auto",
                maxHeight: "400px",
                border: "1px solid #dee2e6",
              }}
            >
              <JsonViewer data={log.metadata} />
            </div>
          </div>
        ) : (
          <div>
            <h3
              style={{
                margin: "0 0 1rem 0",
                fontSize: "1rem",
                fontWeight: "600",
                color: "#495057",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Metadata
            </h3>
            <div
              style={{
                backgroundColor: "#f8f9fa",
                borderRadius: "8px",
                padding: "1rem",
                textAlign: "center",
                color: "#6c757d",
                fontStyle: "italic",
              }}
            >
              No metadata available
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderTop: "2px solid #e9ecef",
          display: "flex",
          justifyContent: "flex-end",
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "1rem",
            cursor: "pointer",
            fontWeight: "500",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.backgroundColor = "#0056b3";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.backgroundColor = "#007bff";
          }}
        >
          Close
        </button>
      </div>
    </div>
  );
}
