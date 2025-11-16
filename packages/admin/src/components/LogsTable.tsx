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
    return new Date(dateString).toLocaleString(undefined, {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  // Group consecutive logs by message, level, project-id, and metadata
  // This preserves chronological order while grouping identical consecutive logs
  const groupLogs = (logs: LogEntry[]): (LogEntry | GroupedLogEntry)[] => {
    // First, sort logs chronologically (most recent first)
    const sortedLogs = [...logs].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });

    const result: (LogEntry | GroupedLogEntry)[] = [];
    let currentGroup: LogEntry[] = [];
    let currentGroupKey: string | null = null;

    const getGroupKey = (log: LogEntry): string => {
      const metadataKey = JSON.stringify(
        log.metadata || {},
        Object.keys(log.metadata || {}).sort()
      );
      return `${log["project-id"]}|${log.level}|${log.message}|${metadataKey}`;
    };

    sortedLogs.forEach((log) => {
      const groupKey = getGroupKey(log);

      if (currentGroupKey === groupKey) {
        // Same as current group, add to it
        currentGroup.push(log);
      } else {
        // Different group, finalize current group if it exists
        if (currentGroup.length > 0) {
          if (currentGroup.length > 1) {
            // Group has multiple logs, create grouped entry
            const sortedGroup = [...currentGroup].sort(
              (a, b) =>
                new Date(a.timestamp).getTime() -
                new Date(b.timestamp).getTime()
            );
            const firstOccurrence = sortedGroup[0];
            const lastOccurrence = sortedGroup[sortedGroup.length - 1];

            result.push({
              ...lastOccurrence, // Use most recent for display
              count: currentGroup.length,
              firstOccurrence: firstOccurrence,
            } as GroupedLogEntry);
          } else {
            // Single log, add as-is
            result.push(currentGroup[0]);
          }
        }

        // Start new group
        currentGroup = [log];
        currentGroupKey = groupKey;
      }
    });

    // Finalize the last group
    if (currentGroup.length > 0) {
      if (currentGroup.length > 1) {
        const sortedGroup = [...currentGroup].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const firstOccurrence = sortedGroup[0];
        const lastOccurrence = sortedGroup[sortedGroup.length - 1];

        result.push({
          ...lastOccurrence,
          count: currentGroup.length,
          firstOccurrence: firstOccurrence,
        } as GroupedLogEntry);
      } else {
        result.push(currentGroup[0]);
      }
    }

    return result;
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
                // When grouped, the log already contains the last occurrence's data
                const displayLog = log;

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
