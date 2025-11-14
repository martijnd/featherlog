import { useState, useEffect } from "react";
import { apiClient, LogEntry, Project } from "./api/client";
import Login from "./components/Login";
import FilterBar from "./components/FilterBar";
import LogsTable from "./components/LogsTable";
import CreateProject from "./components/CreateProject";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // Filter state
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      loadLogs();
    }
  }, [selectedProject, selectedLevel, startDate, endDate, offset]);

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
    apiClient.clearToken();
    setIsAuthenticated(false);
    setLogs([]);
    setProjects([]);
    setSelectedProject("");
    setSelectedLevel("");
    setStartDate("");
    setEndDate("");
    setOffset(0);
  };

  const handleClearFilters = () => {
    setSelectedProject("");
    setSelectedLevel("");
    setStartDate("");
    setEndDate("");
    setOffset(0);
  };

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
          <CreateProject onProjectCreated={loadProjects} />
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

      <FilterBar
        projects={projects}
        selectedProject={selectedProject}
        selectedLevel={selectedLevel}
        startDate={startDate}
        endDate={endDate}
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
        onClearFilters={handleClearFilters}
      />

      <LogsTable
        logs={logs}
        loading={loading}
        total={total}
        limit={limit}
        offset={offset}
        onPageChange={setOffset}
      />
    </div>
  );
}

export default App;
