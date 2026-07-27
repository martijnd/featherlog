import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  apiClient,
  DashboardRange,
  DashboardStats,
  Issue,
  LogEntry,
  Project,
} from "../api/client";

export interface DashboardLogsNav {
  level?: "" | "error" | "warn" | "info";
  startDate: string;
  endDate: string;
}

interface DashboardProps {
  projects: Project[];
  selectedProject: string;
  onProjectChange: (projectId: string) => void;
  onLogClick?: (log: LogEntry) => void;
  /** SSE-driven live log; seq bumps on every event */
  liveEvent?: { seq: number; log: LogEntry } | null;
  onNavigateToLogs?: (nav: DashboardLogsNav) => void;
  onNavigateToIssue?: (fingerprint: string, projectId: string) => void;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function bucketWindow(
  bucketIso: string,
  range: DashboardRange
): { start: Date; end: Date } {
  const start = new Date(bucketIso);
  const end = new Date(start.getTime());
  const stepMs =
    range === "24h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  end.setTime(start.getTime() + stepMs - 1000);
  return { start, end };
}

const RANGES: DashboardRange[] = ["24h", "7d", "30d"];
const RECENT_ERRORS_LIMIT = 15;
const TOP_ISSUES_LIMIT = 10;

const panelStyle: CSSProperties = {
  backgroundColor: "white",
  borderRadius: "8px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  padding: "1.25rem",
};

function bucketKeyForRange(timestamp: string, range: DashboardRange): string {
  const d = new Date(timestamp);
  d.setUTCMilliseconds(0);
  d.setUTCSeconds(0);
  d.setUTCMinutes(0);
  if (range !== "24h") {
    d.setUTCHours(0);
  }
  return d.toISOString();
}

function findSeriesIndex(
  series: DashboardStats["series"],
  key: string
): number {
  const exact = series.findIndex((point) => point.bucket === key);
  if (exact >= 0) return exact;

  const target = new Date(key).getTime();
  let best = -1;
  let bestDelta = Infinity;
  for (let i = 0; i < series.length; i++) {
    const delta = Math.abs(new Date(series[i].bucket).getTime() - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = i;
    }
  }
  // Only accept a nearby bucket (same hour / same day window)
  const maxDelta = 24 * 60 * 60 * 1000;
  return bestDelta <= maxDelta ? best : -1;
}

export default function Dashboard({
  projects,
  selectedProject,
  onProjectChange,
  onLogClick,
  liveEvent = null,
  onNavigateToLogs,
  onNavigateToIssue,
}: DashboardProps) {
  const [range, setRange] = useState<DashboardRange>("7d");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [recentErrors, setRecentErrors] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastLiveSeqRef = useRef<number | null>(liveEvent?.seq ?? null);

  // Ignore events that arrived before this dashboard mount; initial fetch is authoritative.
  useEffect(() => {
    lastLiveSeqRef.current = liveEvent?.seq ?? null;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const statsParams: {
          "project-id"?: string;
          range: DashboardRange;
        } = { range };
        if (selectedProject) statsParams["project-id"] = selectedProject;

        const statsResponse = await apiClient.getDashboardStats(statsParams);
        if (cancelled) return;

        const issuesParams: { "project-id"?: string; limit: number } = {
          limit: TOP_ISSUES_LIMIT,
        };
        if (selectedProject) issuesParams["project-id"] = selectedProject;

        const logsParams: {
          "project-id"?: string;
          level: "error";
          startDate: string;
          limit: number;
        } = {
          level: "error",
          startDate: statsResponse.startDate,
          limit: RECENT_ERRORS_LIMIT,
        };
        if (selectedProject) logsParams["project-id"] = selectedProject;

        const [issuesResponse, logsResponse] = await Promise.all([
          apiClient.getIssues(issuesParams),
          apiClient.getLogs(logsParams),
        ]);

        if (cancelled) return;
        setStats(statsResponse);
        setIssues(issuesResponse.issues);
        setRecentErrors(logsResponse.logs);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load dashboard:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
        setStats(null);
        setIssues([]);
        setRecentErrors([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedProject, range]);

  useEffect(() => {
    if (!liveEvent) return;
    if (lastLiveSeqRef.current === liveEvent.seq) return;
    lastLiveSeqRef.current = liveEvent.seq;

    const log = liveEvent.log;
    if (selectedProject && log["project-id"] !== selectedProject) return;

    setStats((prev) => {
      if (!prev) return prev;
      const ts = new Date(log.timestamp).getTime();
      const start = new Date(prev.startDate).getTime();
      const end = new Date(prev.endDate).getTime();
      if (ts < start || ts > end + 60_000) return prev;

      const level = log.level;
      const totals = {
        ...prev.totals,
        total: prev.totals.total + 1,
        error: prev.totals.error + (level === "error" ? 1 : 0),
        warn: prev.totals.warn + (level === "warn" ? 1 : 0),
        info: prev.totals.info + (level === "info" ? 1 : 0),
      };

      const key = bucketKeyForRange(log.timestamp, prev.range);
      const series = prev.series.map((point) => ({ ...point }));
      const idx = findSeriesIndex(series, key);
      if (idx >= 0) {
        series[idx] = {
          ...series[idx],
          error: series[idx].error + (level === "error" ? 1 : 0),
          warn: series[idx].warn + (level === "warn" ? 1 : 0),
          info: series[idx].info + (level === "info" ? 1 : 0),
        };
      }

      return {
        ...prev,
        endDate: new Date().toISOString(),
        totals,
        series,
      };
    });

    if (log.level === "error") {
      setRecentErrors((prev) => {
        if (prev.some((entry) => entry.id === log.id)) return prev;
        return [log, ...prev].slice(0, RECENT_ERRORS_LIMIT);
      });
    }

    if (log.fingerprint) {
      setIssues((prev) => {
        const existingIdx = prev.findIndex(
          (issue) =>
            issue.fingerprint === log.fingerprint &&
            issue["project-id"] === log["project-id"]
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
          };
          return [
            updated,
            ...prev.filter((_, i) => i !== existingIdx),
          ].slice(0, TOP_ISSUES_LIMIT);
        }

        const created: Issue = {
          fingerprint: log.fingerprint!,
          "project-id": log["project-id"],
          level: log.level,
          message: log.message,
          count: 1,
          first_seen: log.timestamp,
          last_seen: log.timestamp,
          latest_metadata: log.metadata || {},
        };
        return [created, ...prev].slice(0, TOP_ISSUES_LIMIT);
      });
    }
  }, [liveEvent, selectedProject]);

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

  const formatBucket = (bucket: string) => {
    const date = new Date(bucket);
    if (range === "24h") {
      return date.toLocaleString(undefined, {
        hour12: false,
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
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

  const chartData =
    stats?.series.map((point) => ({
      ...point,
      label: formatBucket(point.bucket),
    })) ?? [];

  const totals = stats?.totals ?? { total: 0, error: 0, warn: 0, info: 0 };

  const navigateToRange = (
    level: "" | "error" | "warn" | "info",
    start: Date,
    end: Date
  ) => {
    onNavigateToLogs?.({
      level,
      startDate: toDatetimeLocalValue(start),
      endDate: toDatetimeLocalValue(end),
    });
  };

  const handleCardClick = (level: "" | "error" | "warn" | "info") => {
    if (!stats || !onNavigateToLogs) return;
    navigateToRange(
      level,
      new Date(stats.startDate),
      new Date(stats.endDate)
    );
  };

  const handleChartClick = (state: unknown) => {
    if (!stats || !onNavigateToLogs || !state || typeof state !== "object") {
      return;
    }
    const activePayload = (
      state as {
        activePayload?: Array<{ payload?: { bucket?: string; error?: number; warn?: number; info?: number } }>;
      }
    ).activePayload;
    const point = activePayload?.[0]?.payload;
    if (!point?.bucket) return;

    const levels = (
      [
        point.error ? "error" : null,
        point.warn ? "warn" : null,
        point.info ? "info" : null,
      ] as const
    ).filter((v): v is "error" | "warn" | "info" => v != null);

    const { start, end } = bucketWindow(point.bucket, stats.range);
    navigateToRange(levels.length === 1 ? levels[0] : "", start, end);
  };

  return (
    <div>
      <div
        style={{
          marginBottom: "1.25rem",
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          flexWrap: "wrap",
          justifyContent: "space-between",
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

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              style={{
                padding: "0.4rem 0.85rem",
                borderRadius: "4px",
                border: range === r ? "1px solid #007bff" : "1px solid #ced4da",
                backgroundColor: range === r ? "#007bff" : "white",
                color: range === r ? "white" : "#495057",
                cursor: "pointer",
                fontSize: "0.875rem",
                fontWeight: range === r ? 600 : 400,
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div
          style={{
            ...panelStyle,
            marginBottom: "1rem",
            color: "#dc3545",
            backgroundColor: "#f8d7da",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        {(
          [
            { label: "Total", value: totals.total, color: "#007bff", level: "" as const },
            { label: "Errors", value: totals.error, color: "#dc3545", level: "error" as const },
            { label: "Warnings", value: totals.warn, color: "#ffc107", level: "warn" as const },
            { label: "Info", value: totals.info, color: "#17a2b8", level: "info" as const },
          ] as const
        ).map((card) => (
          <div
            key={card.label}
            role={onNavigateToLogs ? "button" : undefined}
            tabIndex={onNavigateToLogs ? 0 : undefined}
            onClick={() => handleCardClick(card.level)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardClick(card.level);
              }
            }}
            style={{
              ...panelStyle,
              cursor: onNavigateToLogs ? "pointer" : "default",
              transition: "box-shadow 0.15s ease",
            }}
            title={
              onNavigateToLogs
                ? `View ${card.label.toLowerCase()} logs for this range`
                : undefined
            }
          >
            <div
              style={{
                fontSize: "0.8rem",
                color: "#6c757d",
                marginBottom: "0.35rem",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: "1.75rem",
                fontWeight: 700,
                color: card.color,
                lineHeight: 1.1,
              }}
            >
              {loading && !stats ? "—" : card.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...panelStyle, marginBottom: "1.25rem" }}>
        <h3
          style={{
            margin: "0 0 1rem",
            fontSize: "1rem",
            color: "#212529",
            fontWeight: 600,
          }}
        >
          Logs over time
        </h3>
        {loading && !stats ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#6c757d" }}>
            Loading...
          </div>
        ) : chartData.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "#6c757d" }}>
            No log data in this range.
          </div>
        ) : (
          <div
            style={{
              width: "100%",
              height: 320,
              cursor: onNavigateToLogs ? "pointer" : "default",
            }}
          >
            <ResponsiveContainer>
              <AreaChart data={chartData} onClick={handleChartClick}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#6c757d" }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 12, fill: "#6c757d" }}
                  width={40}
                />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="error"
                  name="Error"
                  stackId="1"
                  stroke="#dc3545"
                  fill="#dc3545"
                  fillOpacity={0.55}
                />
                <Area
                  type="monotone"
                  dataKey="warn"
                  name="Warn"
                  stackId="1"
                  stroke="#ffc107"
                  fill="#ffc107"
                  fillOpacity={0.45}
                />
                <Area
                  type="monotone"
                  dataKey="info"
                  name="Info"
                  stackId="1"
                  stroke="#17a2b8"
                  fill="#17a2b8"
                  fillOpacity={0.35}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.25rem",
        }}
      >
        <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid #e9ecef",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            Top issues
          </div>
          {loading && issues.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
              Loading...
            </div>
          ) : issues.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
              No fingerprinted issues in this project.
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
                  <th style={thStyle}>Message</th>
                  <th style={{ ...thStyle, width: 70 }}>Count</th>
                  <th style={{ ...thStyle, width: 140 }}>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr
                    key={`${issue["project-id"]}-${issue.fingerprint}`}
                    onClick={() =>
                      onNavigateToIssue?.(
                        issue.fingerprint,
                        issue["project-id"]
                      )
                    }
                    style={{
                      borderBottom: "1px solid #e9ecef",
                      cursor: onNavigateToIssue ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      if (onNavigateToIssue) {
                        e.currentTarget.style.backgroundColor = "#f8f9fa";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                    title={
                      onNavigateToIssue ? "Open issue in Issues tab" : undefined
                    }
                  >
                    <td style={tdStyle}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <span
                          style={{
                            backgroundColor: getLevelColor(issue.level),
                            color: issue.level === "warn" ? "#212529" : "white",
                            padding: "0.1rem 0.4rem",
                            borderRadius: "3px",
                            fontSize: "0.7rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                          }}
                        >
                          {issue.level}
                        </span>
                        <code style={{ fontSize: "0.75rem", color: "#6c757d" }}>
                          {issue.fingerprint.slice(0, 8)}
                        </code>
                      </div>
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 360,
                        }}
                        title={issue.message}
                      >
                        {issue.message}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{issue.count}</td>
                    <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#6c757d" }}>
                      {formatDate(issue.last_seen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "1rem 1.25rem",
              borderBottom: "1px solid #e9ecef",
              fontWeight: 600,
              fontSize: "1rem",
            }}
          >
            Recent errors
          </div>
          {loading && recentErrors.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
              Loading...
            </div>
          ) : recentErrors.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center", color: "#6c757d" }}>
              No errors in this range.
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
                  <th style={thStyle}>Message</th>
                  <th style={{ ...thStyle, width: 150 }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((log) => (
                  <tr
                    key={log.id}
                    onClick={() => onLogClick?.(log)}
                    style={{
                      borderBottom: "1px solid #e9ecef",
                      cursor: onLogClick ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => {
                      if (onLogClick) {
                        e.currentTarget.style.backgroundColor = "#f8f9fa";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <td style={tdStyle}>
                      <div
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: 360,
                        }}
                        title={log.message}
                      >
                        {log.message}
                      </div>
                      {!selectedProject && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "#6c757d",
                            marginTop: "0.2rem",
                          }}
                        >
                          {log["project-id"]}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontSize: "0.8rem", color: "#6c757d" }}>
                      {formatDate(log.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

const thStyle: CSSProperties = {
  padding: "0.75rem 1rem",
  textAlign: "left",
  fontSize: "0.8rem",
  color: "#495057",
  fontWeight: 600,
};

const tdStyle: CSSProperties = {
  padding: "0.75rem 1rem",
  fontSize: "0.875rem",
  verticalAlign: "top",
};
