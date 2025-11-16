import { LogEntry } from "../api/client";

interface GroupedLogEntry extends LogEntry {
  count: number;
  firstOccurrence: LogEntry;
}

interface LogsTableProps {
  logs: LogEntry[];
  loading: boolean;
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
  onLogClick?: (log: LogEntry) => void;
}

export default function LogsTable({
  logs,
  loading,
  total,
  limit,
  offset,
  onPageChange,
  onLogClick,
}: LogsTableProps) {
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
    return new Date(dateString).toLocaleString();
  };

  // Group logs by message, level, project-id, and metadata
  const groupLogs = (logs: LogEntry[]): (LogEntry | GroupedLogEntry)[] => {
    const groups = new Map<string, LogEntry[]>();

    logs.forEach((log) => {
      // Create a key from message, level, project-id, and normalized metadata
      const metadataKey = JSON.stringify(
        log.metadata || {},
        Object.keys(log.metadata || {}).sort()
      );
      const groupKey = `${log["project-id"]}|${log.level}|${log.message}|${metadataKey}`;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(log);
    });

    const result: (LogEntry | GroupedLogEntry)[] = [];

    groups.forEach((groupedLogs) => {
      if (groupedLogs.length > 1) {
        // Sort by timestamp to get the first and last occurrence
        const sorted = [...groupedLogs].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const firstOccurrence = sorted[0];
        const lastOccurrence = sorted[sorted.length - 1];

        // Use the most recent timestamp for display, but keep reference to first occurrence
        result.push({
          ...lastOccurrence, // Use most recent for display (timestamp, id, etc.)
          count: groupedLogs.length,
          firstOccurrence: firstOccurrence, // Keep reference to first for detail view
        } as GroupedLogEntry);
      } else {
        result.push(groupedLogs[0]);
      }
    });

    // Sort by timestamp (most recent first)
    return result.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });
  };

  const groupedLogs = groupLogs(logs);
  const isGrouped = (
    log: LogEntry | GroupedLogEntry
  ): log is GroupedLogEntry => {
    return "count" in log && log.count > 1;
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>
            No logs found
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr
                style={{
                  backgroundColor: "#f8f9fa",
                  borderBottom: "2px solid #dee2e6",
                }}
              >
                <th
                  style={{
                    padding: "1rem",
                    textAlign: "left",
                    fontWeight: "600",
                  }}
                >
                  Timestamp
                </th>
                <th
                  style={{
                    padding: "1rem",
                    textAlign: "left",
                    fontWeight: "600",
                  }}
                >
                  Project
                </th>
                <th
                  style={{
                    padding: "1rem",
                    textAlign: "left",
                    fontWeight: "600",
                  }}
                >
                  Level
                </th>
                <th
                  style={{
                    padding: "1rem",
                    textAlign: "left",
                    fontWeight: "600",
                  }}
                >
                  Message
                </th>
                <th
                  style={{
                    padding: "1rem",
                    textAlign: "left",
                    fontWeight: "600",
                  }}
                >
                  Metadata
                </th>
              </tr>
            </thead>
            <tbody>
              {groupedLogs.map((log) => {
                const grouped = isGrouped(log);
                const displayLog = grouped ? log.firstOccurrence : log;

                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: "1px solid #dee2e6",
                      cursor: onLogClick ? "pointer" : "default",
                      position: "relative",
                    }}
                    onClick={() => onLogClick?.(displayLog)}
                    onMouseOver={(e) => {
                      if (onLogClick) {
                        e.currentTarget.style.backgroundColor = "#f8f9fa";
                      }
                    }}
                    onMouseOut={(e) => {
                      if (onLogClick) {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }
                    }}
                  >
                    <td style={{ padding: "1rem", fontSize: "0.9rem" }}>
                      {formatDate(displayLog.timestamp)}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "0.9rem" }}>
                      {displayLog["project-id"]}
                    </td>
                    <td style={{ padding: "1rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "0.25rem 0.75rem",
                          borderRadius: "4px",
                          backgroundColor: getLevelColor(displayLog.level),
                          color: "white",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                        }}
                      >
                        {displayLog.level.toUpperCase()}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "1rem",
                        fontSize: "0.9rem",
                        maxWidth: "400px",
                        wordBreak: "break-word",
                      }}
                    >
                      {displayLog.message}
                    </td>
                    <td style={{ padding: "1rem", fontSize: "0.9rem" }}>
                      {grouped && (
                        <span
                          style={{
                            position: "absolute",
                            top: "50%",
                            right: "0",
                            transform: "translate(50%, -50%)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: "24px",
                            height: "24px",
                            padding: "0 6px",
                            backgroundColor: "#007bff",
                            color: "white",
                            borderRadius: "12px",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            lineHeight: "1",
                            zIndex: 10,
                            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                          }}
                          title={`This error occurred ${log.count} times`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onLogClick?.(displayLog);
                          }}
                        >
                          {log.count}
                        </span>
                      )}
                      {Object.keys(displayLog.metadata || {}).length > 0 ? (
                        <details>
                          <summary
                            style={{ cursor: "pointer", color: "#007bff" }}
                          >
                            View ({Object.keys(displayLog.metadata).length}{" "}
                            keys)
                          </summary>
                          <pre
                            style={{
                              marginTop: "0.5rem",
                              padding: "0.5rem",
                              backgroundColor: "#f8f9fa",
                              borderRadius: "4px",
                              fontSize: "0.8rem",
                              overflow: "auto",
                            }}
                          >
                            {JSON.stringify(displayLog.metadata, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span style={{ color: "#6c757d" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div
          style={{
            marginTop: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1rem",
            backgroundColor: "white",
            borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <div>
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}{" "}
            logs
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => onPageChange(Math.max(0, offset - limit))}
              disabled={offset === 0}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: offset === 0 ? "#e9ecef" : "#007bff",
                color: offset === 0 ? "#6c757d" : "white",
                border: "none",
                borderRadius: "4px",
                cursor: offset === 0 ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>
            <span style={{ padding: "0.5rem" }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(offset + limit)}
              disabled={offset + limit >= total}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor:
                  offset + limit >= total ? "#e9ecef" : "#007bff",
                color: offset + limit >= total ? "#6c757d" : "white",
                border: "none",
                borderRadius: "4px",
                cursor: offset + limit >= total ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
