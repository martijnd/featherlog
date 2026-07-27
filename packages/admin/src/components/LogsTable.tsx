import { Fragment, useMemo, useState } from "react";
import { LogEntry } from "../api/client";
import { formatRelativeDate } from "../time";
import { levelBadgeClass } from "../ui";
import { flashLevelClass, useArriveFlash } from "../useArriveFlash";
import RelativeTime from "./RelativeTime";
import SortableTh, {
  SortState,
  createSortHandler,
} from "./SortableTh";

interface GroupedLogEntry extends LogEntry {
  count: number;
  firstOccurrence: LogEntry;
  occurrences: LogEntry[];
}

export type LogSortKey = "timestamp" | "project" | "level" | "message" | "metadata";

interface LogsTableProps {
  logs: LogEntry[];
  loading: boolean;
  total: number;
  limit: number;
  offset: number;
  sort: SortState<LogSortKey>;
  onSortChange: (sort: SortState<LogSortKey>) => void;
  onPageChange: (offset: number) => void;
  onLogClick?: (log: LogEntry) => void;
}

const MAX_VISIBLE_OCCURRENCES = 10;

const LOG_SORT_DEFAULTS: Partial<Record<LogSortKey, "asc" | "desc">> = {
  timestamp: "desc",
  metadata: "desc",
};

export default function LogsTable({
  logs,
  loading,
  total,
  limit,
  offset,
  sort,
  onSortChange,
  onPageChange,
  onLogClick,
}: LogsTableProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const handleSort = createSortHandler(
    (updater) => onSortChange(updater(sort)),
    LOG_SORT_DEFAULTS
  );
  const logIds = useMemo(() => logs.map((log) => log.id), [logs]);
  const flashing = useArriveFlash(logIds);

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

  /** Preserve server order; only collapse consecutive identical rows. */
  const groupLogs = (entries: LogEntry[]): (LogEntry | GroupedLogEntry)[] => {
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

    for (const log of entries) {
      const groupKey = getGroupKey(log);

      if (currentGroupKey === groupKey) {
        currentGroup.push(log);
      } else {
        finalizeGroup(currentGroup);
        currentGroup = [log];
        currentGroupKey = groupKey;
      }
    }

    finalizeGroup(currentGroup);
    return result;
  };

  const groupedLogs = useMemo(() => groupLogs(logs), [logs]);

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
                <SortableTh
                  label="Timestamp"
                  column="timestamp"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableTh
                  label="Project"
                  column="project"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableTh
                  label="Level"
                  column="level"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableTh
                  label="Message"
                  column="message"
                  sort={sort}
                  onSort={handleSort}
                />
                <SortableTh
                  label="Metadata"
                  column="metadata"
                  sort={sort}
                  onSort={handleSort}
                />
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
                      <td className="cell-muted">
                        <RelativeTime value={displayLog.timestamp} />
                      </td>
                      <td>{displayLog["project-id"]}</td>
                      <td>
                        <span className={levelBadgeClass(displayLog.level)}>
                          {displayLog.level}
                        </span>
                      </td>
                      <td style={{ maxWidth: 400, wordBreak: "break-word" }}>
                        <div className="u-flex-center u-gap-sm" style={{ flexWrap: "wrap" }}>
                          {onLogClick ? (
                            <button
                              type="button"
                              className="table-row-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                onLogClick(displayLog);
                              }}
                              aria-label={`Open log: ${displayLog.level} ${displayLog.message} (${formatRelativeDate(displayLog.timestamp)})`}
                            >
                              {displayLog.message}
                            </button>
                          ) : (
                            <span style={{ minWidth: 0 }}>{displayLog.message}</span>
                          )}
                          {grouped && (
                            <button
                              type="button"
                              className={`badge-count${isExpanded ? " is-active" : ""}`}
                              title={`Show ${Math.min(log.count, MAX_VISIBLE_OCCURRENCES)} of ${log.count} occurrences`}
                              aria-expanded={isExpanded}
                              aria-label={`${log.count} occurrences`}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleGroupExpanded(rowKey);
                              }}
                              style={{ flexShrink: 0 }}
                            >
                              {log.count}
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        {Object.keys(displayLog.metadata || {}).length > 0 ? (
                          <details onClick={(e) => e.stopPropagation()}>
                            <summary className="meta-summary">
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
                                  role={onLogClick ? "button" : undefined}
                                  tabIndex={onLogClick ? 0 : undefined}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onLogClick?.(occurrence);
                                  }}
                                  onKeyDown={
                                    onLogClick
                                      ? (e) => {
                                          if (
                                            e.key === "Enter" ||
                                            e.key === " "
                                          ) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onLogClick(occurrence);
                                          }
                                        }
                                      : undefined
                                  }
                                >
                                  <span>
                                    <RelativeTime value={occurrence.timestamp} />
                                  </span>
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
