import { useEffect, useMemo, useRef, useState } from "react";
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
import { chartColors, levelBadgeClass } from "../ui";
import { flashLevelClass, flashRowClass, useArriveFlash } from "../useArriveFlash";
import RelativeTime from "./RelativeTime";

export interface DashboardLogsNav {
  level?: "" | "error" | "warn" | "info";
  startDate?: string;
  endDate?: string;
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

const RANGES: Array<{ id: DashboardRange; label: string }> = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "all", label: "all" },
];
const RECENT_ERRORS_LIMIT = 15;
const TOP_ISSUES_LIMIT = 10;

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
  const loadSeqRef = useRef(0);
  const rangeRef = useRef(range);
  const loadingRef = useRef(loading);
  const statsRangeRef = useRef<DashboardRange | undefined>(stats?.range);
  rangeRef.current = range;
  loadingRef.current = loading;
  statsRangeRef.current = stats?.range;
  const [flashingIssues, setFlashingIssues] = useState<Set<string>>(
    () => new Set()
  );
  const issueFlashTimers = useRef<Map<string, number>>(new Map());
  const recentErrorIds = useMemo(
    () => recentErrors.map((log) => log.id),
    [recentErrors]
  );
  const flashingErrors = useArriveFlash(recentErrorIds);

  const flashIssue = (fingerprint: string) => {
    setFlashingIssues((prev) => {
      const next = new Set(prev);
      next.add(fingerprint);
      return next;
    });
    const existing = issueFlashTimers.current.get(fingerprint);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      setFlashingIssues((prev) => {
        const next = new Set(prev);
        next.delete(fingerprint);
        return next;
      });
      issueFlashTimers.current.delete(fingerprint);
    }, 1500);
    issueFlashTimers.current.set(fingerprint, timer);
  };

  useEffect(() => {
    return () => {
      for (const timer of issueFlashTimers.current.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  useEffect(() => {
    lastLiveSeqRef.current = liveEvent?.seq ?? null;
  }, []);

  useEffect(() => {
    const seq = ++loadSeqRef.current;
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
        if (cancelled || seq !== loadSeqRef.current) return;

        const issuesParams: {
          "project-id"?: string;
          status: "open";
          limit: number;
        } = {
          status: "open",
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

        if (cancelled || seq !== loadSeqRef.current) return;
        setStats(statsResponse);
        setIssues(issuesResponse.issues);
        setRecentErrors(logsResponse.logs);
      } catch (err) {
        if (cancelled || seq !== loadSeqRef.current) return;
        console.error("Failed to load dashboard:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load dashboard"
        );
        setStats(null);
        setIssues([]);
        setRecentErrors([]);
      } finally {
        if (!cancelled && seq === loadSeqRef.current) {
          setLoading(false);
        }
      }
    };

    void load();
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
    // Don't patch stale range data while a range/project reload is in flight
    if (loadingRef.current) return;
    if (statsRangeRef.current && statsRangeRef.current !== rangeRef.current) {
      return;
    }

    setStats((prev) => {
      if (!prev) return prev;
      if (prev.range !== rangeRef.current) return prev;

      const allTimeTotal = (prev.allTimeTotal ?? 0) + 1;

      const ts = new Date(log.timestamp).getTime();
      const start = new Date(prev.startDate).getTime();
      const end = new Date(prev.endDate).getTime();
      if (
        prev.range !== "all" &&
        (ts < start || ts > end + 60_000)
      ) {
        return { ...prev, allTimeTotal };
      }

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
        allTimeTotal,
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
      flashIssue(log.fingerprint);
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
            status: "open",
            resolved_at: null,
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
          status: "open",
          resolved_at: null,
        };
        return [created, ...prev].slice(0, TOP_ISSUES_LIMIT);
      });
    }
  }, [liveEvent, selectedProject]);

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

  const chartData =
    stats?.series.map((point) => ({
      ...point,
      label: formatBucket(point.bucket),
    })) ?? [];

  const totals = stats?.totals ?? { total: 0, error: 0, warn: 0, info: 0 };
  const statsMatchRange = Boolean(stats && stats.range === range);
  const showStatsLoading = loading || !statsMatchRange;

  const navigateToRange = (
    level: "" | "error" | "warn" | "info",
    start?: Date,
    end?: Date
  ) => {
    onNavigateToLogs?.({
      level,
      startDate: start ? toDatetimeLocalValue(start) : "",
      endDate: end ? toDatetimeLocalValue(end) : "",
    });
  };

  const handleCardClick = (level: "" | "error" | "warn" | "info") => {
    if (!stats || !onNavigateToLogs) return;
    if (stats.range === "all") {
      navigateToRange(level);
      return;
    }
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
        activePayload?: Array<{
          payload?: {
            bucket?: string;
            error?: number;
            warn?: number;
            info?: number;
          };
        }>;
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

  const kpiCards = [
    {
      label: "Total",
      value: totals.total,
      valueClass: "is-total",
      level: "" as const,
    },
    {
      label: "Errors",
      value: totals.error,
      valueClass: "is-error",
      level: "error" as const,
    },
    {
      label: "Warnings",
      value: totals.warn,
      valueClass: "is-warn",
      level: "warn" as const,
    },
    {
      label: "Info",
      value: totals.info,
      valueClass: "is-info",
      level: "info" as const,
    },
  ];

  return (
    <div>
      <div className="toolbar">
        <div className="toolbar-cluster">
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

          <div className="segmented" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.id}
                type="button"
                className={`segmented-item${range === r.id ? " is-active" : ""}`}
                disabled={loading}
                aria-busy={loading || undefined}
                onClick={() => {
                  if (r.id !== range) setRange(r.id);
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error u-mb-md">{error}</div>}

      <div className="kpi-grid">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`kpi-card${onNavigateToLogs ? " is-clickable" : ""}`}
            role={onNavigateToLogs ? "button" : undefined}
            tabIndex={onNavigateToLogs ? 0 : undefined}
            onClick={() => handleCardClick(card.level)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardClick(card.level);
              }
            }}
            title={
              onNavigateToLogs
                ? `View ${card.label.toLowerCase()} logs for this range`
                : undefined
            }
          >
            <div className="kpi-label">{card.label}</div>
            <div className={`kpi-value ${card.valueClass}`}>
              {showStatsLoading ? "—" : card.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      <div className="panel panel-pad u-mb-md">
        <h3 className="panel-section-title" style={{ marginBottom: "1rem" }}>
          Logs over time
        </h3>
        {showStatsLoading ? (
          <div className="empty-state">Loading…</div>
        ) : chartData.length === 0 ? (
          <div className="empty-state">No log data in this range.</div>
        ) : (
          <div
            className="chart-wrap"
            style={{
              cursor: onNavigateToLogs ? "pointer" : "default",
            }}
          >
            <ResponsiveContainer>
              <AreaChart data={chartData} onClick={handleChartClick}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: chartColors.tick }}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: chartColors.tick }}
                  width={36}
                />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="error"
                  name="Error"
                  stackId="1"
                  stroke={chartColors.error}
                  fill={chartColors.error}
                  fillOpacity={0.45}
                />
                <Area
                  type="monotone"
                  dataKey="warn"
                  name="Warn"
                  stackId="1"
                  stroke={chartColors.warn}
                  fill={chartColors.warn}
                  fillOpacity={0.4}
                />
                <Area
                  type="monotone"
                  dataKey="info"
                  name="Info"
                  stackId="1"
                  stroke={chartColors.info}
                  fill={chartColors.info}
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="dashboard-split">
        <div className="panel panel-flush">
          <div className="panel-header">Top issues</div>
          {loading && issues.length === 0 ? (
            <div className="empty-state">Loading…</div>
          ) : issues.length === 0 ? (
            <div className="empty-state">
              No fingerprinted issues in this project.
            </div>
          ) : (
            <div className="table-scroll">
            <table className="data-table table-compact">
              <thead>
                <tr>
                  <th>Message</th>
                  <th className="col-count">Count</th>
                  <th className="col-time">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr
                    key={`${issue["project-id"]}-${issue.fingerprint}`}
                    className={[
                      onNavigateToIssue ? "is-clickable" : "",
                      flashingIssues.has(issue.fingerprint)
                        ? flashLevelClass(issue.level)
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                    role={onNavigateToIssue ? "button" : undefined}
                    tabIndex={onNavigateToIssue ? 0 : undefined}
                    onClick={() =>
                      onNavigateToIssue?.(
                        issue.fingerprint,
                        issue["project-id"]
                      )
                    }
                    onKeyDown={
                      onNavigateToIssue
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onNavigateToIssue(
                                issue.fingerprint,
                                issue["project-id"]
                              );
                            }
                          }
                        : undefined
                    }
                    title={
                      onNavigateToIssue ? "Open issue in Issues tab" : undefined
                    }
                  >
                    <td>
                      <div
                        className="u-flex-center u-gap-sm"
                        style={{ marginBottom: "0.25rem" }}
                      >
                        <span className={levelBadgeClass(issue.level)}>
                          {issue.level}
                        </span>
                        <code className="cell-mono">
                          {issue.fingerprint.slice(0, 8)}
                        </code>
                      </div>
                      <div className="cell-message" title={issue.message}>
                        {issue.message}
                      </div>
                    </td>
                    <td>
                      <span className="badge-count">{issue.count}</span>
                    </td>
                    <td className="cell-muted cell-time">
                      <RelativeTime value={issue.last_seen} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div className="panel panel-flush">
          <div className="panel-header">Recent errors</div>
          {loading && recentErrors.length === 0 ? (
            <div className="empty-state">Loading…</div>
          ) : recentErrors.length === 0 ? (
            <div className="empty-state">No errors in this range.</div>
          ) : (
            <div className="table-scroll">
            <table className="data-table table-compact">
              <thead>
                <tr>
                  <th>Message</th>
                  <th className="col-time">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((log) => (
                  <tr
                    key={log.id}
                    className={[
                      onLogClick ? "is-clickable" : "",
                      flashRowClass(flashingErrors, log.id, log.level),
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                    role={onLogClick ? "button" : undefined}
                    tabIndex={onLogClick ? 0 : undefined}
                    onClick={() => onLogClick?.(log)}
                    onKeyDown={
                      onLogClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onLogClick(log);
                            }
                          }
                        : undefined
                    }
                  >
                    <td>
                      <div className="cell-message" title={log.message}>
                        {log.message}
                      </div>
                      {!selectedProject && (
                        <div className="cell-muted u-mt-sm">{log["project-id"]}</div>
                      )}
                    </td>
                    <td className="cell-muted cell-time">
                      <RelativeTime value={log.timestamp} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
