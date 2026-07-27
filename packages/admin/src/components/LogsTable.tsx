import { Fragment, useMemo, useState } from "react";
import { LogEntry } from "../api/client";
import { levelBadgeClass } from "../ui";
import { flashLevelClass, useArriveFlash } from "../useArriveFlash";

interface GroupedLogEntry extends LogEntry {
  count: number;
  firstOccurrence: LogEntry;
  occurrences: LogEntry[];
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

const MAX_VISIBLE_OCCURRENCES = 10;

export default function LogsTable({
  logs,
  loading,
  total,
  limit,
  offset,
  onPageChange,
  onLogClick,
}: LogsTableProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const logIds = useMemo(() => logs.map((log) => log.id), [logs]);
  const flashing = useArriveFlash(logIds);

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

  const getGroupKey = (log: LogEntry): string => {
    const metadataKey = JSON.stringify(
      log.metadata || {},
      Object.keys(log.metadata || {}).sort()
    );
    return `${log["project-id"]}|${log.level}|${log.message}|${metadataKey}`;
  };

  const createGroupedEntry = (group: LogEntry[]): GroupedLogEntry => {
    const newestFirst = [...group].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    const lastOccurrence = newestFirst[0];
    const firstOccurrence = newestFirst[newestFirst.length - 1];

    return {
      ...lastOccurrence,
      count: group.length,
      firstOccurrence,
      occurrences: newestFirst,
    };
  };

  const groupLogs = (logs: LogEntry[]): (LogEntry | GroupedLogEntry)[] => {
    const sortedLogs = [...logs].sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return bTime - aTime;
    });

    const result: (LogEntry | GroupedLogEntry)[] = [];
    let currentGroup: LogEntry[] = [];
    let currentGroupKey: string | null = null;

    const finalizeGroup = (group: LogEntry[]) => {
      if (group.length === 0) return;
      if (group.length > 1) {
        result.push(createGroupedEntry(group));
      } else {
        result.push(group[0]);
      }
    };

    sortedLogs.forEach((log) => {
      const groupKey = getGroupKey(log);

      if (currentGroupKey === groupKey) {
        currentGroup.push(log);
      } else {
        finalizeGroup(currentGroup);
        currentGroup = [log];
        currentGroupKey = groupKey;
      }
    });

    finalizeGroup(currentGroup);

    return result;
  };

  const groupedLogs = groupLogs(logs);
  const isGrouped = (
    log: LogEntry | GroupedLogEntry
  ): log is GroupedLogEntry => {
    return "count" in log && log.count > 1;
  };

  const toggleGroupExpanded = (groupKey: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="panel panel-flush">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">No logs found</div>
        ) : (
          <div className="table-scroll">
          <table className="data-table hide-secondary">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Project</th>
                <th>Level</th>
                <th>Message</th>
                <th>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {groupedLogs.map((log) => {
                const grouped = isGrouped(log);
                const displayLog = log;
                const rowKey = grouped ? getGroupKey(log) : String(log.id);
                const isExpanded = grouped && expandedGroups.has(rowKey);
                const visibleOccurrences = grouped
                  ? log.occurrences.slice(0, MAX_VISIBLE_OCCURRENCES)
                  : [];
                const isFlashing = grouped
                  ? log.occurrences.some((o) => flashing.has(String(o.id)))
                  : flashing.has(String(displayLog.id));
                const rowClass = [
                  onLogClick ? "is-clickable" : "",
                  isFlashing ? flashLevelClass(displayLog.level) : "",
                ]
                  .filter(Boolean)
                  .join(" ");

                return (
                  <Fragment key={rowKey}>
                    <tr
                      className={rowClass || undefined}
                      onClick={() => onLogClick?.(displayLog)}
                    >
                      <td className="cell-muted">{formatDate(displayLog.timestamp)}</td>
                      <td>{displayLog["project-id"]}</td>
                      <td>
                        <span className={levelBadgeClass(displayLog.level)}>
                          {displayLog.level}
                        </span>
                      </td>
                      <td style={{ maxWidth: 400, wordBreak: "break-word" }}>
                        <div className="u-flex-center u-gap-sm" style={{ flexWrap: "wrap" }}>
                          <span style={{ minWidth: 0 }}>{displayLog.message}</span>
                          {grouped && (
                            <span
                              className={`badge-count${isExpanded ? " is-active" : ""}`}
                              title={`Show ${Math.min(log.count, MAX_VISIBLE_OCCURRENCES)} of ${log.count} occurrences`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupExpanded(rowKey);
                              }}
                              style={{ cursor: "pointer", flexShrink: 0 }}
                            >
                              {log.count}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        {Object.keys(displayLog.metadata || {}).length > 0 ? (
                          <details onClick={(e) => e.stopPropagation()}>
                            <summary
                              style={{
                                cursor: "pointer",
                                color: "var(--accent)",
                              }}
                            >
                              View ({Object.keys(displayLog.metadata).length}{" "}
                              keys)
                            </summary>
                            <pre
                              className="message-block"
                              style={{
                                marginTop: "0.5rem",
                                fontSize: "12px",
                                maxHeight: 200,
                                overflow: "auto",
                              }}
                            >
                              {JSON.stringify(displayLog.metadata, null, 2)}
                            </pre>
                          </details>
                        ) : (
                          <span className="u-text-muted">—</span>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            padding: "0 1rem 1rem",
                            background: "var(--surface-muted)",
                          }}
                        >
                          <div className="nested-panel">
                            <div className="nested-panel-header">
                              Occurrences
                              {log.count > MAX_VISIBLE_OCCURRENCES
                                ? ` (showing ${MAX_VISIBLE_OCCURRENCES} of ${log.count})`
                                : ` (${log.count})`}
                            </div>
                            <ul className="occurrence-list">
                              {visibleOccurrences.map((occurrence) => (
                                <li
                                  key={occurrence.id}
                                  className={`occurrence-item${onLogClick ? " is-clickable" : ""}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onLogClick?.(occurrence);
                                  }}
                                >
                                  <span>{formatDate(occurrence.timestamp)}</span>
                                  <span className="cell-mono">
                                    #{occurrence.id}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <div>
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}{" "}
            logs
          </div>
          <div className="pagination-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onPageChange(Math.max(0, offset - limit))}
              disabled={offset === 0}
            >
              Previous
            </button>
            <span className="u-text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => onPageChange(offset + limit)}
              disabled={offset + limit >= total}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
