import { Fragment, useEffect, useState } from "react";
import { apiClient, Issue, LogEntry, Project } from "../api/client";

interface IssuesListProps {
  projects: Project[];
  selectedProject: string;
  onProjectChange: (projectId: string) => void;
  onLogClick?: (log: LogEntry) => void;
  /** Bump to reload issues (e.g. after realtime capture) */
  refreshKey?: number;
}

export default function IssuesList({
  projects,
  selectedProject,
  onProjectChange,
  onLogClick,
  refreshKey = 0,
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
    setExpandedFingerprint(null);
  }, [selectedProject]);

  useEffect(() => {
    if (!expandedFingerprint) return;
    const issue = issues.find((i) => i.fingerprint === expandedFingerprint);
    if (!issue) return;

    let cancelled = false;
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
        // keep existing occurrences on refresh failure
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
      return;
    }

    setExpandedFingerprint(issue.fingerprint);
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
      <div
        style={{
          marginBottom: "1rem",
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.9rem", color: "#495057" }}>Project</span>
          <select
            value={selectedProject}
            onChange={(e) => onProjectChange(e.target.value)}
            style={{
              padding: "0.5rem 0.75rem",
              borderRadius: "4px",
              border: "1px solid #ced4da",
              fontSize: "0.9rem",
            }}
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.id})
              </option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: "0.875rem", color: "#6c757d" }}>
          Grouped by fingerprint from <code>logger.capture()</code>
        </span>
      </div>

      <div
        style={{
          backgroundColor: "white",
          borderRadius: "8px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
        }}
      >
        {loading ? (
          <div style={{ padding: "2rem", textAlign: "center" }}>Loading...</div>
        ) : issues.length === 0 ? (
          <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
            No issues yet. Use <code>logger.capture(error)</code> to create
            fingerprinted issues.
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
                <th style={{ padding: "1rem", textAlign: "left" }}>Issue</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Project</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>Count</th>
                <th style={{ padding: "1rem", textAlign: "left" }}>
                  First seen
                </th>
                <th style={{ padding: "1rem", textAlign: "left" }}>
                  Last seen
                </th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => {
                const isExpanded = expandedFingerprint === issue.fingerprint;
                return (
                  <Fragment key={issue.fingerprint}>
                    <tr
                      style={{
                        borderBottom: isExpanded
                          ? "none"
                          : "1px solid #dee2e6",
                        cursor: "pointer",
                      }}
                      onClick={() => toggleIssue(issue)}
                      onMouseOver={(e) => {
                        e.currentTarget.style.backgroundColor = "#f8f9fa";
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                    >
                      <td style={{ padding: "1rem" }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                          }}
                        >
                          <span style={{ color: "#6c757d", width: "1rem" }}>
                            {isExpanded ? "▼" : "▶"}
                          </span>
                          <span
                            style={{
                              display: "inline-block",
                              padding: "0.25rem 0.75rem",
                              borderRadius: "4px",
                              backgroundColor: getLevelColor(issue.level),
                              color: "white",
                              fontSize: "0.75rem",
                              fontWeight: "500",
                            }}
                          >
                            {getErrorName(issue)}
                          </span>
                          <div>
                            <div
                              style={{
                                fontSize: "0.95rem",
                                fontWeight: "500",
                                wordBreak: "break-word",
                              }}
                            >
                              {issue.message}
                            </div>
                            <code
                              style={{
                                fontSize: "0.75rem",
                                color: "#6c757d",
                              }}
                            >
                              {issue.fingerprint}
                            </code>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.9rem" }}>
                        {issue["project-id"]}
                      </td>
                      <td style={{ padding: "1rem" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: "28px",
                            padding: "0.2rem 0.5rem",
                            backgroundColor: "#007bff",
                            color: "white",
                            borderRadius: "12px",
                            fontSize: "0.8rem",
                            fontWeight: "600",
                          }}
                        >
                          {issue.count}
                        </span>
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.85rem" }}>
                        {formatDate(issue.first_seen)}
                      </td>
                      <td style={{ padding: "1rem", fontSize: "0.85rem" }}>
                        {formatDate(issue.last_seen)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            padding: "0 1rem 1rem 1rem",
                            backgroundColor: "#f8f9fa",
                            borderBottom: "1px solid #dee2e6",
                          }}
                        >
                          <div
                            style={{
                              border: "1px solid #dee2e6",
                              borderRadius: "4px",
                              backgroundColor: "white",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                padding: "0.5rem 0.75rem",
                                fontSize: "0.8rem",
                                fontWeight: "600",
                                color: "#495057",
                                borderBottom: "1px solid #dee2e6",
                                backgroundColor: "#f1f3f5",
                              }}
                            >
                              Recent occurrences
                            </div>
                            {occurrencesLoading ? (
                              <div style={{ padding: "1rem" }}>Loading...</div>
                            ) : occurrences.length === 0 ? (
                              <div
                                style={{
                                  padding: "1rem",
                                  color: "#6c757d",
                                }}
                              >
                                No occurrences
                              </div>
                            ) : (
                              <ul
                                style={{
                                  listStyle: "none",
                                  margin: 0,
                                  padding: 0,
                                }}
                              >
                                {occurrences.map((log, index) => (
                                  <li
                                    key={log.id}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: "1rem",
                                      padding: "0.6rem 0.75rem",
                                      borderBottom:
                                        index < occurrences.length - 1
                                          ? "1px solid #eee"
                                          : "none",
                                      cursor: onLogClick
                                        ? "pointer"
                                        : "default",
                                      fontSize: "0.85rem",
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onLogClick?.(log);
                                    }}
                                    onMouseOver={(e) => {
                                      if (onLogClick) {
                                        e.currentTarget.style.backgroundColor =
                                          "#f8f9fa";
                                      }
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.backgroundColor =
                                        "transparent";
                                    }}
                                  >
                                    <span>{formatDate(log.timestamp)}</span>
                                    <span
                                      style={{
                                        color: "#6c757d",
                                        fontFamily: "monospace",
                                      }}
                                    >
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
            issues
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
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
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
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
