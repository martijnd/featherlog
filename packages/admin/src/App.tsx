import { useState, useEffect, useRef } from "react";
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

function getShareTokenFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/share\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function App() {
  const shareToken = getShareTokenFromPath(window.location.pathname);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [isRealtime, setIsRealtime] = useState(true);
  const [activeView, setActiveView] = useState<
    "dashboard" | "logs" | "issues" | "projects"
  >("dashboard");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [issuesRefreshKey, setIssuesRefreshKey] = useState(0);
  const [expandIssueFingerprint, setExpandIssueFingerprint] = useState<
    string | null
  >(null);
  const [dashboardLiveEvent, setDashboardLiveEvent] = useState<{
    seq: number;
    log: LogEntry;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Filter state
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [requestId, setRequestId] = useState("");
  const [whereFilters, setWhereFilters] = useState<string[]>([]);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    // Check if user is already authenticated
    if (apiClient.getToken()) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      loadProjects();
      loadLogs();
      startRealtimeUpdates();
    }

    return () => {
      // Cleanup: close SSE connection on unmount
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      // Reload logs when filters change (even in realtime mode, we need to reload initial set)
      // But skip if offset changes in realtime mode (pagination handled separately)
      if (isRealtime && offset === 0) {
        // In realtime mode, reload initial logs when filters change
        loadLogs();
      } else if (!isRealtime) {
        // In manual mode, reload on any filter/offset change
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

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      const eventSource = apiClient.createLogStream(
        (newLog: LogEntry) => {
          // Check if the new log matches current filters
          if (matchesFilters(newLog)) {
            setLogs((prevLogs) => {
              // Add new log at the beginning (most recent first)
              const updatedLogs = [newLog, ...prevLogs];
              // Keep only the first `limit` logs to match pagination
              return updatedLogs.slice(0, limit);
            });
            // Update total count
            setTotal((prevTotal) => prevTotal + 1);
          }

          // Refresh issues when a fingerprinted capture arrives
          if (newLog.fingerprint) {
            setIssuesRefreshKey((k) => k + 1);
          }

          // Push live log to dashboard for incremental updates
          setDashboardLiveEvent((prev) => ({
            seq: (prev?.seq ?? 0) + 1,
            log: newLog,
          }));
        },
        (_error) => {
          // Only reconnect if we're still in realtime mode and connection was actually established
          // This prevents reconnecting during normal page load interruptions
          if (
            isRealtime &&
            eventSourceRef.current?.readyState === EventSource.CLOSED
          ) {
            console.warn("SSE connection lost, attempting to reconnect...");
            // Attempt to reconnect after a delay
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
    // Close SSE connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    apiClient.clearToken();
    setIsAuthenticated(false);
    setLogs([]);
    setProjects([]);
    setSelectedProject("");
    setSelectedLevel("");
    setStartDate("");
    setEndDate("");
    setRequestId("");
    setWhereFilters([]);
    setOffset(0);
  };

  const toggleRealtime = () => {
    const newRealtimeState = !isRealtime;
    setIsRealtime(newRealtimeState);

    if (newRealtimeState) {
      // Start realtime updates
      startRealtimeUpdates();
    } else {
      // Stop realtime updates and reload logs
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

  const navigateToLogsFromDashboard = (nav: DashboardLogsNav) => {
    setSelectedLevel(nav.level ?? "");
    setStartDate(nav.startDate);
    setEndDate(nav.endDate);
    setRequestId("");
    setWhereFilters([]);
    setOffset(0);
    setActiveView("logs");
  };

  const navigateToIssueFromDashboard = (
    fingerprint: string,
    projectId: string
  ) => {
    setSelectedProject(projectId);
    setExpandIssueFingerprint(fingerprint);
    setActiveView("issues");
  };

  const showToast = (
    message: string,
    type: "success" | "error" = "success"
  ) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3000);
  };

  const handleProjectCreated = () => {
    loadProjects();
    showToast("Project created successfully!", "success");
  };

  if (shareToken) {
    return <ShareView token={shareToken} />;
  }

  if (!isAuthenticated) {
    return <Login onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "2rem",
        maxWidth: "1400px",
        margin: "0 auto",
      }}
    >
      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "1rem",
            right: "1rem",
            backgroundColor: toast.type === "success" ? "#28a745" : "#dc3545",
            color: "white",
            padding: "1rem 1.5rem",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            maxWidth: "400px",
            transform: "translateX(0)",
            transition: "transform 0.3s ease-out, opacity 0.3s ease-out",
            opacity: 1,
          }}
        >
          <span style={{ fontSize: "1.25rem", flexShrink: 0 }}>
            {toast.type === "success" ? "✓" : "✗"}
          </span>
          <span style={{ flex: 1 }}>{toast.message}</span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "none",
              border: "none",
              color: "white",
              fontSize: "1.25rem",
              cursor: "pointer",
              padding: "0",
              marginLeft: "0.5rem",
              lineHeight: "1",
              flexShrink: 0,
              opacity: 0.8,
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.opacity = "1";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.opacity = "0.8";
            }}
          >
            ×
          </button>
        </div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "2rem",
        }}
      >
        <h1>Featherlog Admin</h1>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {(activeView === "dashboard" ||
            activeView === "logs" ||
            activeView === "issues") && (
            <button
              onClick={toggleRealtime}
              style={{
                padding: "0.5rem 1rem",
                backgroundColor: isRealtime ? "#28a745" : "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: "pointer",
              }}
              title={
                isRealtime
                  ? "Realtime updates enabled"
                  : "Realtime updates disabled"
              }
            >
              {isRealtime ? "● Realtime" : "○ Manual"}
            </button>
          )}
          {activeView === "projects" && (
            <CreateProject onProjectCreated={handleProjectCreated} />
          )}
          <button
            onClick={handleLogout}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          borderBottom: "2px solid #e9ecef",
        }}
      >
        <button
          onClick={() => setActiveView("dashboard")}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "transparent",
            color: activeView === "dashboard" ? "#007bff" : "#6c757d",
            border: "none",
            borderBottom:
              activeView === "dashboard"
                ? "2px solid #007bff"
                : "2px solid transparent",
            cursor: "pointer",
            fontWeight: activeView === "dashboard" ? "600" : "400",
            marginBottom: "-2px",
          }}
        >
          Dashboard
        </button>
        <button
          onClick={() => setActiveView("logs")}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "transparent",
            color: activeView === "logs" ? "#007bff" : "#6c757d",
            border: "none",
            borderBottom:
              activeView === "logs"
                ? "2px solid #007bff"
                : "2px solid transparent",
            cursor: "pointer",
            fontWeight: activeView === "logs" ? "600" : "400",
            marginBottom: "-2px",
          }}
        >
          Logs
        </button>
        <button
          onClick={() => setActiveView("issues")}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "transparent",
            color: activeView === "issues" ? "#007bff" : "#6c757d",
            border: "none",
            borderBottom:
              activeView === "issues"
                ? "2px solid #007bff"
                : "2px solid transparent",
            cursor: "pointer",
            fontWeight: activeView === "issues" ? "600" : "400",
            marginBottom: "-2px",
          }}
        >
          Issues
        </button>
        <button
          onClick={() => setActiveView("projects")}
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: "transparent",
            color: activeView === "projects" ? "#007bff" : "#6c757d",
            border: "none",
            borderBottom:
              activeView === "projects"
                ? "2px solid #007bff"
                : "2px solid transparent",
            cursor: "pointer",
            fontWeight: activeView === "projects" ? "600" : "400",
            marginBottom: "-2px",
          }}
        >
          Projects
        </button>
      </div>

      {activeView === "dashboard" && (
        <Dashboard
          projects={projects}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
          onLogClick={setSelectedLog}
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
            onLogClick={setSelectedLog}
          />
        </>
      )}

      {activeView === "issues" && (
        <IssuesList
          projects={projects}
          selectedProject={selectedProject}
          onProjectChange={setSelectedProject}
          onLogClick={setSelectedLog}
          refreshKey={issuesRefreshKey}
          expandFingerprint={expandIssueFingerprint}
          onExpandFingerprintHandled={() => setExpandIssueFingerprint(null)}
        />
      )}

      {activeView === "projects" && (
        <ProjectsManager projects={projects} onProjectUpdated={loadProjects} />
      )}

      {/* Log Detail Modal */}
      {selectedLog && (
        <LogDetail log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  );
}

export default App;
