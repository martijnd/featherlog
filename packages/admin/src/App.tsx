import { useState, useEffect, useRef, useCallback } from "react";
import { apiClient, LogEntry, Project } from "./api/client";
import Login from "./components/Login";
import FilterBar from "./components/FilterBar";
import LogsTable from "./components/LogsTable";
import LogDetail from "./components/LogDetail";
import CreateProject from "./components/CreateProject";
import ProjectsManager from "./components/ProjectsManager";
import IssuesList from "./components/IssuesList";
import Dashboard, { DashboardLogsNav } from "./components/Dashboard";
import ShareView from "./components/ShareView";
import {
  AdminRoute,
  AdminView,
  navigatePath,
  parseAdminRoute,
  pathForIssue,
  pathForLog,
  pathForView,
} from "./permalink";

function App() {
  const initialRoute = parseAdminRoute(
    window.location.pathname,
    window.location.search
  );
  const shareToken =
    initialRoute.kind === "share" ? initialRoute.token : null;

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [isRealtime, setIsRealtime] = useState(true);
  const [activeView, setActiveView] = useState<AdminView>("dashboard");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [issuesRefreshKey, setIssuesRefreshKey] = useState(0);
  const [expandIssueFingerprint, setExpandIssueFingerprint] = useState<
    string | null
  >(null);
  const [expandedIssue, setExpandedIssue] = useState<{
    fingerprint: string;
    projectId: string;
  } | null>(null);
  const [dashboardLiveEvent, setDashboardLiveEvent] = useState<{
    seq: number;
    log: LogEntry;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const skipUrlSyncRef = useRef(false);
  const routeResolvedRef = useRef(false);

  // Filter state
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [requestId, setRequestId] = useState("");
  const [whereFilters, setWhereFilters] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const showToast = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      setToast({ message, type });
      setTimeout(() => {
        setToast(null);
      }, 3000);
    },
    []
  );

  const applyRoute = useCallback(
    async (route: AdminRoute, replaceUrl = false) => {
      skipUrlSyncRef.current = true;
      try {
        switch (route.kind) {
          case "dashboard":
            setActiveView("dashboard");
            setSelectedLog(null);
            setExpandIssueFingerprint(null);
            setExpandedIssue(null);
            if (replaceUrl) navigatePath("/", true);
            break;
          case "logs":
            setActiveView("logs");
            setSelectedLog(null);
            if (replaceUrl) navigatePath("/logs", true);
            break;
          case "log": {
            setActiveView("logs");
            try {
              const log = await apiClient.getLog(route.id);
              setSelectedLog(log);
              if (replaceUrl) navigatePath(pathForLog(route.id), true);
            } catch {
              showToast("Log not found", "error");
              setSelectedLog(null);
              setActiveView("logs");
              navigatePath("/logs", true);
            }
            break;
          }
          case "issues":
            setActiveView("issues");
            setSelectedLog(null);
            setExpandIssueFingerprint(null);
            setExpandedIssue(null);
            if (replaceUrl) navigatePath("/issues", true);
            break;
          case "issue":
            setActiveView("issues");
            setSelectedLog(null);
            setSelectedProject(route.projectId);
            setExpandIssueFingerprint(route.fingerprint);
            setExpandedIssue({
              fingerprint: route.fingerprint,
              projectId: route.projectId,
            });
            if (replaceUrl) {
              navigatePath(
                pathForIssue(route.fingerprint, route.projectId),
                true
              );
            }
            break;
          case "projects":
            setActiveView("projects");
            setSelectedLog(null);
            if (replaceUrl) navigatePath("/projects", true);
            break;
          default:
            setActiveView("dashboard");
            if (replaceUrl) navigatePath("/", true);
            break;
        }
      } finally {
        setTimeout(() => {
          skipUrlSyncRef.current = false;
        }, 0);
      }
    },
    [showToast]
  );

  useEffect(() => {
    if (apiClient.getToken()) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || shareToken) return;
    if (routeResolvedRef.current) return;
    routeResolvedRef.current = true;
    const route = parseAdminRoute(
      window.location.pathname,
      window.location.search
    );
    if (route.kind === "share") return;
    void applyRoute(route, true);
  }, [isAuthenticated, shareToken, applyRoute]);

  useEffect(() => {
    if (!isAuthenticated || shareToken) return;

    const onPopState = () => {
      const route = parseAdminRoute(
        window.location.pathname,
        window.location.search
      );
      if (route.kind === "share") return;
      void applyRoute(route, false);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isAuthenticated, shareToken, applyRoute]);

  useEffect(() => {
    if (isAuthenticated) {
      loadProjects();
      loadLogs();
      startRealtimeUpdates();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      if (isRealtime && offset === 0) {
        loadLogs();
      } else if (!isRealtime) {
        loadLogs();
      }
    }
  }, [
    selectedProject,
    selectedLevel,
    startDate,
    endDate,
    requestId,
    whereFilters,
    offset,
    isRealtime,
  ]);

  const startRealtimeUpdates = () => {
    if (!isRealtime) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const eventSource = apiClient.createLogStream(
        (newLog: LogEntry) => {
          if (matchesFilters(newLog)) {
            setLogs((prevLogs) => {
              const updatedLogs = [newLog, ...prevLogs];
              return updatedLogs.slice(0, limit);
            });
            setTotal((prevTotal) => prevTotal + 1);
          }

          if (newLog.fingerprint) {
            setIssuesRefreshKey((k) => k + 1);
          }

          setDashboardLiveEvent((prev) => ({
            seq: (prev?.seq ?? 0) + 1,
            log: newLog,
          }));
        },
        (_error) => {
          if (
            isRealtime &&
            eventSourceRef.current?.readyState === EventSource.CLOSED
          ) {
            console.warn("SSE connection lost, attempting to reconnect...");
            setTimeout(() => {
              if (isRealtime) {
                startRealtimeUpdates();
              }
            }, 3000);
          }
        },
        () => {
          console.log("SSE connected");
        }
      );

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error("Failed to create SSE connection:", error);
      setIsRealtime(false);
    }
  };

  const getMetadataPath = (obj: Record<string, any>, path: string): unknown => {
    return path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as object)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, obj);
  };

  const matchesWhere = (log: LogEntry, clause: string): boolean => {
    const eq = clause.indexOf("=");
    if (eq <= 0) return true;
    const path = clause.slice(0, eq).trim();
    const expectedRaw = clause.slice(eq + 1).trim();
    let expected: unknown = expectedRaw;
    if (expectedRaw === "true") expected = true;
    else if (expectedRaw === "false") expected = false;
    else if (expectedRaw === "null") expected = null;
    else if (/^-?\d+(\.\d+)?$/.test(expectedRaw)) expected = Number(expectedRaw);

    const actual = getMetadataPath(log.metadata || {}, path);
    return actual === expected || String(actual) === expectedRaw;
  };

  const matchesFilters = (log: LogEntry): boolean => {
    if (selectedProject && log["project-id"] !== selectedProject) {
      return false;
    }
    if (selectedLevel && log.level !== selectedLevel) {
      return false;
    }
    if (startDate && new Date(log.timestamp) < new Date(startDate)) {
      return false;
    }
    if (endDate && new Date(log.timestamp) > new Date(endDate)) {
      return false;
    }
    if (
      requestId &&
      String((log.metadata || {}).request_id ?? "") !== requestId
    ) {
      return false;
    }
    for (const clause of whereFilters) {
      if (!matchesWhere(log, clause)) return false;
    }
    return true;
  };

  const loadProjects = async () => {
    try {
      const response = await apiClient.getProjects();
      setProjects(response.projects);
    } catch (error) {
      console.error("Failed to load projects:", error);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params: any = {
        limit,
        offset,
      };

      if (selectedProject) params["project-id"] = selectedProject;
      if (selectedLevel) params.level = selectedLevel;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (requestId) params.request_id = requestId;
      if (whereFilters.length > 0) params.where = whereFilters;

      const response = await apiClient.getLogs(params);
      setLogs(response.logs);
      setTotal(response.total);
    } catch (error) {
      console.error("Failed to load logs:", error);
      if (error instanceof Error && error.message === "Unauthorized") {
        setIsAuthenticated(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    apiClient.clearToken();
    setIsAuthenticated(false);
    routeResolvedRef.current = false;
    setLogs([]);
    setProjects([]);
    setSelectedProject("");
    setSelectedLevel("");
    setStartDate("");
    setEndDate("");
    setRequestId("");
    setWhereFilters([]);
    setOffset(0);
    setSelectedLog(null);
    setExpandedIssue(null);
  };

  const toggleRealtime = () => {
    const newRealtimeState = !isRealtime;
    setIsRealtime(newRealtimeState);

    if (newRealtimeState) {
      startRealtimeUpdates();
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      loadLogs();
    }
  };

  const handleClearFilters = () => {
    setSelectedProject("");
    setSelectedLevel("");
    setStartDate("");
    setEndDate("");
    setRequestId("");
    setWhereFilters([]);
    setOffset(0);
  };

  const switchView = (view: AdminView) => {
    setActiveView(view);
    setSelectedLog(null);
    if (view !== "issues") {
      setExpandIssueFingerprint(null);
      setExpandedIssue(null);
    }
    if (!skipUrlSyncRef.current) {
      navigatePath(pathForView(view));
    }
  };

  const openLog = (log: LogEntry) => {
    setSelectedLog(log);
    if (!skipUrlSyncRef.current) {
      navigatePath(pathForLog(log.id));
    }
  };

  const closeLog = () => {
    setSelectedLog(null);
    if (skipUrlSyncRef.current) return;
    if (activeView === "issues" && expandedIssue) {
      navigatePath(
        pathForIssue(expandedIssue.fingerprint, expandedIssue.projectId)
      );
    } else {
      navigatePath(pathForView(activeView));
    }
  };

  const handleExpandedIssueChange = (
    issue: { fingerprint: string; projectId: string } | null
  ) => {
    setExpandedIssue(issue);
    if (skipUrlSyncRef.current) return;
    if (issue) {
      navigatePath(pathForIssue(issue.fingerprint, issue.projectId));
    } else if (activeView === "issues" && !selectedLog) {
      navigatePath("/issues");
    }
  };

  const navigateToLogsFromDashboard = (nav: DashboardLogsNav) => {
    setSelectedLevel(nav.level ?? "");
    setStartDate(nav.startDate);
    setEndDate(nav.endDate);
    setRequestId("");
    setWhereFilters([]);
    setOffset(0);
    switchView("logs");
  };

  const navigateToIssueFromDashboard = (
    fingerprint: string,
    projectId: string
  ) => {
    setSelectedProject(projectId);
    setExpandIssueFingerprint(fingerprint);
    setExpandedIssue({ fingerprint, projectId });
    setActiveView("issues");
    setSelectedLog(null);
    navigatePath(pathForIssue(fingerprint, projectId));
  };

  const handleProjectCreated = () => {
    loadProjects();
    showToast("Project created successfully!", "success");
  };

  const handleLogin = () => {
    routeResolvedRef.current = false;
    setIsAuthenticated(true);
  };

  if (shareToken) {
    return <ShareView token={shareToken} />;
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const navItems: { id: AdminView; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "logs", label: "Logs" },
    { id: "issues", label: "Issues" },
    { id: "projects", label: "Projects" },
  ];

  return (
    <div className="app-shell">
      {toast && (
        <div
          className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}
          role="status"
        >
          <span>{toast.type === "success" ? "✓" : "✗"}</span>
          <span className="u-flex-1">{toast.message}</span>
          <button
            type="button"
            className="toast-close"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <header className="app-header">
        <div className="app-brand">
          <span className="app-brand-mark" aria-hidden>
            F
          </span>
          <span className="app-brand-name">Featherlog</span>
        </div>

        <div className="app-header-actions">
          {(activeView === "dashboard" ||
            activeView === "logs" ||
            activeView === "issues") && (
            <button
              type="button"
              className={`live-pill${isRealtime ? " is-on" : ""}`}
              onClick={toggleRealtime}
              title={
                isRealtime
                  ? "Realtime updates enabled"
                  : "Realtime updates disabled"
              }
            >
              <span className="live-dot" aria-hidden />
              <span className="live-pill-label">
                {isRealtime ? "Live" : "Paused"}
              </span>
            </button>
          )}
          {activeView === "projects" && (
            <CreateProject onProjectCreated={handleProjectCreated} />
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleLogout}
          >
            Log out
          </button>
        </div>

        <nav className="app-nav" aria-label="Primary">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`app-nav-item${activeView === item.id ? " is-active" : ""}`}
              onClick={() => switchView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="app-main">
        {activeView === "dashboard" && (
          <Dashboard
            projects={projects}
            selectedProject={selectedProject}
            onProjectChange={setSelectedProject}
            onLogClick={openLog}
            liveEvent={isRealtime ? dashboardLiveEvent : null}
            onNavigateToLogs={navigateToLogsFromDashboard}
            onNavigateToIssue={navigateToIssueFromDashboard}
          />
        )}

        {activeView === "logs" && (
          <>
            <FilterBar
              projects={projects}
              selectedProject={selectedProject}
              selectedLevel={selectedLevel}
              startDate={startDate}
              endDate={endDate}
              requestId={requestId}
              whereFilters={whereFilters}
              onProjectChange={(projectId) => {
                setSelectedProject(projectId);
                setOffset(0);
              }}
              onLevelChange={(level) => {
                setSelectedLevel(level);
                setOffset(0);
              }}
              onStartDateChange={(date) => {
                setStartDate(date);
                setOffset(0);
              }}
              onEndDateChange={(date) => {
                setEndDate(date);
                setOffset(0);
              }}
              onRequestIdChange={(id) => {
                setRequestId(id);
                setOffset(0);
              }}
              onWhereFiltersChange={(filters) => {
                setWhereFilters(filters);
                setOffset(0);
              }}
              onClearFilters={handleClearFilters}
            />

            <LogsTable
              logs={logs}
              loading={loading}
              total={total}
              limit={limit}
              offset={offset}
              onPageChange={setOffset}
              onLogClick={openLog}
            />
          </>
        )}

        {activeView === "issues" && (
          <IssuesList
            projects={projects}
            selectedProject={selectedProject}
            onProjectChange={setSelectedProject}
            onLogClick={openLog}
            refreshKey={issuesRefreshKey}
            expandFingerprint={expandIssueFingerprint}
            onExpandFingerprintHandled={() => setExpandIssueFingerprint(null)}
            onExpandedIssueChange={handleExpandedIssueChange}
          />
        )}

        {activeView === "projects" && (
          <ProjectsManager projects={projects} onProjectUpdated={loadProjects} />
        )}
      </main>

      {selectedLog && <LogDetail log={selectedLog} onClose={closeLog} />}
    </div>
  );
}

export default App;
