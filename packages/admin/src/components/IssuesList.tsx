import { Fragment, useEffect, useState } from "react";
import { apiClient, Issue, LogEntry, Project } from "../api/client";
import ShareLinkPanel from "./ShareLinkPanel";
import CopyPermalinkButton from "./CopyPermalinkButton";
import { issuePermalink } from "../permalink";
import { levelBadgeClass } from "../ui";

interface IssuesListProps {
  projects: Project[];
  selectedProject: string;
  onProjectChange: (projectId: string) => void;
  onLogClick?: (log: LogEntry) => void;
  /** Bump to reload issues (e.g. after realtime capture) */
  refreshKey?: number;
  /** Expand this fingerprint when present (e.g. dashboard click-through) */
  expandFingerprint?: string | null;
  onExpandFingerprintHandled?: () => void;
  onExpandedIssueChange?: (
    issue: { fingerprint: string; projectId: string } | null
  ) => void;
}

export default function IssuesList({
  projects,
  selectedProject,
  onProjectChange,
  onLogClick,
  refreshKey = 0,
  expandFingerprint = null,
  onExpandFingerprintHandled,
  onExpandedIssueChange,
}: IssuesListProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [expandedFingerprint, setExpandedFingerprint] = useState<string | null>(
    null
  );
  const [occurrences, setOccurrences] = useState<LogEntry[]>([]);
  const [occurrencesLoading, setOccurrencesLoading] = useState(false);
  const limit = 50;

  useEffect(() => {
    loadIssues();
  }, [selectedProject, offset, refreshKey]);

  useEffect(() => {
    setOffset(0);
    if (!expandFingerprint) {
      setExpandedFingerprint(null);
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
    setExpandedFingerprint(expandFingerprint);
    onExpandedIssueChange?.({
      fingerprint: issue.fingerprint,
      projectId: issue["project-id"],
    });
    onExpandFingerprintHandled?.();
  }, [expandFingerprint, issues, loading]);

  useEffect(() => {
    if (!expandedFingerprint) return;
    const issue = issues.find((i) => i.fingerprint === expandedFingerprint);
    if (!issue) return;

    let cancelled = false;
    setOccurrencesLoading(true);
    (async () => {
      try {
        const response = await apiClient.getIssueOccurrences(
          issue.fingerprint,
          {
            "project-id": issue["project-id"],
            limit: 20,
          }
        );
        if (!cancelled) setOccurrences(response.logs);
      } catch {
        if (!cancelled) setOccurrences([]);
      } finally {
        if (!cancelled) setOccurrencesLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, expandedFingerprint, issues]);

  const loadIssues = async () => {
    setLoading(true);
    try {
      const params: { "project-id"?: string; limit: number; offset: number } = {
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

  const toggleIssue = async (issue: Issue) => {
    if (expandedFingerprint === issue.fingerprint) {
      setExpandedFingerprint(null);
      setOccurrences([]);
      onExpandedIssueChange?.(null);
      return;
    }

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
        <span className="u-text-sm u-text-muted u-hide-sm">
          Grouped by fingerprint from <code>logger.capture()</code>
        </span>
      </div>

      <div className="panel panel-flush">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : issues.length === 0 ? (
          <div className="empty-state">
            No issues yet. Use <code>logger.capture(error)</code> to create
            fingerprinted issues.
          </div>
        ) : (
          <div className="table-scroll">
          <table className="data-table hide-dates">
            <thead>
              <tr>
                <th>Issue</th>
                <th>Project</th>
                <th>Count</th>
                <th>First seen</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
                const isExpanded = expandedFingerprint === issue.fingerprint;
                return (
                  <Fragment key={issue.fingerprint}>
                    <tr
                      className="is-clickable"
                      onClick={() => toggleIssue(issue)}
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
                            <code className="cell-mono">{issue.fingerprint}</code>
                          </div>
                        </div>
                      </td>
                      <td>{issue["project-id"]}</td>
                      <td>
                        <span className="badge-count">{issue.count}</span>
                      </td>
                      <td className="cell-muted">
                        {formatDate(issue.first_seen)}
                      </td>
                      <td className="cell-muted">
                        {formatDate(issue.last_seen)}
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
                              <span>Recent occurrences</span>
                              <div className="u-flex-center u-gap-sm">
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
                              <div className="empty-state" style={{ padding: "1rem" }}>
                                Loading…
                              </div>
                            ) : occurrences.length === 0 ? (
                              <div className="empty-state" style={{ padding: "1rem" }}>
                                No occurrences
                              </div>
                            ) : (
                              <ul className="occurrence-list">
                                {occurrences.map((log) => (
                                  <li
                                    key={log.id}
                                    className={`occurrence-item${onLogClick ? " is-clickable" : ""}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onLogClick?.(log);
                                    }}
                                  >
                                    <span>{formatDate(log.timestamp)}</span>
                                    <span className="cell-mono">#{log.id}</span>
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
