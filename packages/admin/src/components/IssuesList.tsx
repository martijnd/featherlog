import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  apiClient,
  Issue,
  IssueStatus,
  LogEntry,
  Project,
} from "../api/client";
import ShareLinkPanel from "./ShareLinkPanel";
import CopyPermalinkButton from "./CopyPermalinkButton";
import { issuePermalink } from "../permalink";
import { issueStatusBadgeClass, levelBadgeClass } from "../ui";
import RelativeTime from "./RelativeTime";
import { flashLevelClass } from "../useArriveFlash";

type StatusFilter = IssueStatus | "all";

interface IssuesListProps {
  projects: Project[];
  selectedProject: string;
  onProjectChange: (projectId: string) => void;
  onLogClick?: (log: LogEntry) => void;
  /** SSE-driven live log; seq bumps on every event */
  liveEvent?: { seq: number; log: LogEntry } | null;
  /** Expand this fingerprint when present (e.g. dashboard click-through) */
  expandFingerprint?: string | null;
  onExpandFingerprintHandled?: () => void;
  onExpandedIssueChange?: (
    issue: { fingerprint: string; projectId: string } | null
  ) => void;
}

function issueKey(issue: Pick<Issue, "fingerprint" | "project-id">): string {
  return `${issue["project-id"]}\0${issue.fingerprint}`;
}

export default function IssuesList({
  projects,
  selectedProject,
  onProjectChange,
  onLogClick,
  liveEvent = null,
  expandFingerprint = null,
  onExpandFingerprintHandled,
  onExpandedIssueChange,
}: IssuesListProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [expandedFingerprint, setExpandedFingerprint] = useState<string | null>(
    null
  );
  const [occurrences, setOccurrences] = useState<LogEntry[]>([]);
  const [occurrencesLoading, setOccurrencesLoading] = useState(false);
  const [flashingIssues, setFlashingIssues] = useState<Set<string>>(
    () => new Set()
  );
  const limit = 50;
  const lastLiveSeq = useRef<number | null>(null);
  const flashTimers = useRef<Map<string, number>>(new Map());
  const issuesRef = useRef(issues);
  issuesRef.current = issues;

  const flashIssueRow = (key: string) => {
    const existing = flashTimers.current.get(key);
    if (existing) window.clearTimeout(existing);
    setFlashingIssues((prev) => new Set(prev).add(key));
    const timer = window.setTimeout(() => {
      setFlashingIssues((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      flashTimers.current.delete(key);
    }, 1500);
    flashTimers.current.set(key, timer);
  };

  useEffect(() => {
    return () => {
      for (const timer of flashTimers.current.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    void loadIssues();
  }, [selectedProject, offset, statusFilter]);

  useEffect(() => {
    setOffset(0);
    if (!expandFingerprint) {
      setExpandedFingerprint(null);
      setOccurrences([]);
      onExpandedIssueChange?.(null);
    }
  }, [selectedProject]);

  useEffect(() => {
    if (!expandFingerprint || loading) return;
    const issue = issues.find((i) => i.fingerprint === expandFingerprint);
    if (!issue) {
      onExpandFingerprintHandled?.();
      return;
    }
    if (expandedFingerprint !== expandFingerprint) {
      void expandIssue(issue);
    }
    onExpandFingerprintHandled?.();
  }, [expandFingerprint, issues, loading]);

  // Apply SSE updates in place — avoid full refetch / loading flicker
  useEffect(() => {
    if (!liveEvent) return;
    if (lastLiveSeq.current === liveEvent.seq) return;
    lastLiveSeq.current = liveEvent.seq;

    const log = liveEvent.log;
    if (!log.fingerprint) return;
    if (selectedProject && log["project-id"] !== selectedProject) return;
    // Only mutate the first page so pagination stays coherent
    if (offset !== 0) return;

    const fingerprint = log.fingerprint;
    const projectId = log["project-id"];
    const key = `${projectId}\0${fingerprint}`;
    const prev = issuesRef.current;
    const existingIdx = prev.findIndex(
      (issue) =>
        issue.fingerprint === fingerprint && issue["project-id"] === projectId
    );

    if (existingIdx >= 0) {
      const existing = prev[existingIdx];
      const updated: Issue = {
        ...existing,
        level: log.level,
        message: log.message,
        count: existing.count + 1,
        last_seen: log.timestamp,
        latest_metadata: log.metadata || {},
        status: "open",
        resolved_at: null,
      };

      if (statusFilter === "resolved") {
        setIssues(prev.filter((_, i) => i !== existingIdx));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setIssues(
          [updated, ...prev.filter((_, i) => i !== existingIdx)].slice(0, limit)
        );
        flashIssueRow(key);
      }
    } else if (statusFilter !== "resolved") {
      const created: Issue = {
        fingerprint,
        "project-id": projectId,
        level: log.level,
        message: log.message,
        count: 1,
        first_seen: log.timestamp,
        last_seen: log.timestamp,
        latest_metadata: log.metadata || {},
        status: "open",
        resolved_at: null,
      };
      setIssues([created, ...prev].slice(0, limit));
      setTotal((t) => t + 1);
      flashIssueRow(key);
    }

    if (expandedFingerprint === fingerprint) {
      setOccurrences((occ) => {
        if (occ.some((entry) => entry.id === log.id)) return occ;
        return [log, ...occ].slice(0, 20);
      });
    }
  }, [liveEvent, selectedProject, statusFilter, offset, expandedFingerprint]);

  const loadIssues = async () => {
    const isInitial = issuesRef.current.length === 0;
    if (isInitial) setLoading(true);
    try {
      const params: {
        "project-id"?: string;
        status: StatusFilter;
        limit: number;
        offset: number;
      } = {
        status: statusFilter,
        limit,
        offset,
      };
      if (selectedProject) params["project-id"] = selectedProject;
      const response = await apiClient.getIssues(params);
      setIssues(response.issues);
      setTotal(response.total);
    } catch (error) {
      console.error("Failed to load issues:", error);
    } finally {
      setLoading(false);
    }
  };

  const expandIssue = async (issue: Issue) => {
    setExpandedFingerprint(issue.fingerprint);
    onExpandedIssueChange?.({
      fingerprint: issue.fingerprint,
      projectId: issue["project-id"],
    });
    setOccurrencesLoading(true);
    try {
      const response = await apiClient.getIssueOccurrences(issue.fingerprint, {
        "project-id": issue["project-id"],
        limit: 20,
      });
      setOccurrences(response.logs);
    } catch (error) {
      console.error("Failed to load occurrences:", error);
      setOccurrences([]);
    } finally {
      setOccurrencesLoading(false);
    }
  };

  const toggleIssue = async (issue: Issue) => {
    if (expandedFingerprint === issue.fingerprint) {
      setExpandedFingerprint(null);
      setOccurrences([]);
      onExpandedIssueChange?.(null);
      return;
    }
    await expandIssue(issue);
  };

  const handleStatusChange = async (
    issue: Issue,
    status: IssueStatus,
    e: MouseEvent
  ) => {
    e.stopPropagation();
    setStatusUpdating(issue.fingerprint);
    try {
      await apiClient.updateIssueStatus(
        issue.fingerprint,
        issue["project-id"],
        status
      );
      await loadIssues();
    } catch (error) {
      console.error("Failed to update issue status:", error);
    } finally {
      setStatusUpdating(null);
    }
  };

  const getErrorName = (issue: Issue) => {
    const error = issue.latest_metadata?.error;
    if (error && typeof error === "object" && typeof error.name === "string") {
      return error.name;
    }
    return "Error";
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <div className="toolbar">
        <label className="form-row">
          <span className="form-inline-label">Project</span>
          <select
            className="select select-inline"
            value={selectedProject}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </label>
        <label className="form-row">
          <span className="form-inline-label">Status</span>
          <select
            className="select select-inline"
            value={statusFilter}
            onChange={(e) => {
              setOffset(0);
              setStatusFilter(e.target.value as StatusFilter);
            }}
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        </label>
        <span className="u-text-sm u-text-muted u-hide-sm">
          Grouped by fingerprint from <code>logger.capture()</code>
        </span>
      </div>

      <div className="panel panel-flush">
        {loading && issues.length === 0 ? (
          <div className="empty-state">Loading…</div>
        ) : issues.length === 0 ? (
          <div className="empty-state">
            {statusFilter === "resolved"
              ? "No resolved issues."
              : statusFilter === "open"
                ? "No open issues. Use "
                : "No issues yet. Use "}
            {statusFilter !== "resolved" && (
              <>
                <code>logger.capture(error)</code> to create fingerprinted
                issues.
              </>
            )}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table hide-dates">
              <thead>
                <tr>
                  <th>Issue</th>
                  <th>Status</th>
                  <th>Project</th>
                  <th>Count</th>
                  <th>First seen</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => {
                  const isExpanded = expandedFingerprint === issue.fingerprint;
                  const updating = statusUpdating === issue.fingerprint;
                  const key = issueKey(issue);
                  const flashClass = flashingIssues.has(key)
                    ? flashLevelClass(issue.level)
                    : "";
                  return (
                    <Fragment key={key}>
                      <tr
                        className={["is-clickable", flashClass]
                          .filter(Boolean)
                          .join(" ")}
                        role="button"
                        tabIndex={0}
                        aria-expanded={isExpanded}
                        aria-label={`${issue.status} ${getErrorName(issue)}: ${issue.message}`}
                        onClick={() => toggleIssue(issue)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            void toggleIssue(issue);
                          }
                        }}
                      >
                        <td>
                          <div className="u-flex-center u-gap-md">
                            <span className="expand-caret">
                              {isExpanded ? "▼" : "▶"}
                            </span>
                            <span className={levelBadgeClass(issue.level)}>
                              {getErrorName(issue)}
                            </span>
                            <div>
                              <div
                                style={{
                                  fontWeight: 500,
                                  wordBreak: "break-word",
                                }}
                              >
                                {issue.message}
                              </div>
                              <code className="cell-mono">
                                {issue.fingerprint}
                              </code>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={issueStatusBadgeClass(issue.status)}>
                            {issue.status}
                          </span>
                        </td>
                        <td>{issue["project-id"]}</td>
                        <td>
                          <span className="badge-count">{issue.count}</span>
                        </td>
                        <td className="cell-muted">
                          <RelativeTime value={issue.first_seen} />
                        </td>
                        <td className="cell-muted">
                          <RelativeTime value={issue.last_seen} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan={6}
                            style={{
                              padding: "0 1rem 1rem",
                              background: "var(--surface-muted)",
                            }}
                          >
                            <div className="nested-panel">
                              <div className="nested-panel-header">
                                <span>Recent occurrences</span>
                                <div className="u-flex-center u-gap-sm">
                                  {issue.status === "resolved" ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      disabled={updating}
                                      onClick={(e) =>
                                        handleStatusChange(issue, "open", e)
                                      }
                                    >
                                      {updating ? "…" : "Reopen"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-sm"
                                      disabled={updating}
                                      onClick={(e) =>
                                        handleStatusChange(
                                          issue,
                                          "resolved",
                                          e
                                        )
                                      }
                                    >
                                      {updating ? "…" : "Resolve"}
                                    </button>
                                  )}
                                  <CopyPermalinkButton
                                    url={issuePermalink(
                                      issue.fingerprint,
                                      issue["project-id"]
                                    )}
                                  />
                                  <ShareLinkPanel
                                    request={{
                                      type: "issue",
                                      fingerprint: issue.fingerprint,
                                      "project-id": issue["project-id"],
                                    }}
                                  />
                                </div>
                              </div>
                              {occurrencesLoading ? (
                                <div
                                  className="empty-state"
                                  style={{ padding: "1rem" }}
                                >
                                  Loading…
                                </div>
                              ) : occurrences.length === 0 ? (
                                <div
                                  className="empty-state"
                                  style={{ padding: "1rem" }}
                                >
                                  No occurrences
                                </div>
                              ) : (
                                <ul className="occurrence-list">
                                  {occurrences.map((log) => (
                                    <li
                                      key={log.id}
                                      className={`occurrence-item${onLogClick ? " is-clickable" : ""}`}
                                      role={onLogClick ? "button" : undefined}
                                      tabIndex={onLogClick ? 0 : undefined}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onLogClick?.(log);
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
                                                onLogClick(log);
                                              }
                                            }
                                          : undefined
                                      }
                                    >
                                      <span>
                                        <RelativeTime value={log.timestamp} />
                                      </span>
                                      <span className="cell-mono">
                                        #{log.id}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
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
            issues
          </div>
          <div className="pagination-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setOffset(Math.max(0, offset - limit))}
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
              onClick={() => setOffset(offset + limit)}
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
