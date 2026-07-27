import { useState } from "react";
import { apiClient, Project } from "../api/client";

interface ProjectsManagerProps {
  projects: Project[];
  onProjectUpdated: () => void;
}

export default function ProjectsManager({
  projects,
  onProjectUpdated,
}: ProjectsManagerProps) {
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [origins, setOrigins] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingLogsId, setClearingLogsId] = useState<string | null>(null);

  const startEdit = (project: Project) => {
    setEditingProject(project);
    setOrigins([...project.origins]);
    setError("");
  };

  const cancelEdit = () => {
    setEditingProject(null);
    setOrigins([]);
    setError("");
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    setError("");
    setLoading(true);

    try {
      const validOrigins = origins.filter((origin) => origin.trim() !== "");

      if (validOrigins.length === 0) {
        setError("At least one origin is required");
        setLoading(false);
        return;
      }

      if (validOrigins.length === 1 && validOrigins[0] === "*") {
        setError(
          "Cannot use '*' as the only origin. Specify at least one valid origin."
        );
        setLoading(false);
        return;
      }

      await apiClient.updateProjectOrigins(editingProject.id, validOrigins);
      setEditingProject(null);
      setOrigins([]);
      onProjectUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projectId: string) => {
    if (
      !confirm(
        `Are you sure you want to delete project "${projectId}"? This will also delete all associated logs.`
      )
    ) {
      return;
    }

    setDeletingId(projectId);
    setError("");

    try {
      await apiClient.deleteProject(projectId);
      onProjectUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete project");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearLogs = async (projectId: string, projectName: string) => {
    if (
      !confirm(
        `Are you sure you want to clear all logs for project "${projectName}" (${projectId})? This action cannot be undone.`
      )
    ) {
      return;
    }

    setClearingLogsId(projectId);
    setError("");

    try {
      const result = await apiClient.clearProjectLogs(projectId);
      alert(
        `Successfully cleared ${result.deletedCount} log(s) for project "${projectName}"`
      );
      onProjectUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear logs");
    } finally {
      setClearingLogsId(null);
    }
  };

  const addOriginField = () => {
    setOrigins([...origins, ""]);
  };

  const removeOriginField = (index: number) => {
    setOrigins(origins.filter((_, i) => i !== index));
  };

  const updateOrigin = (index: number, value: string) => {
    const newOrigins = [...origins];
    newOrigins[index] = value;
    setOrigins(newOrigins);
  };

  return (
    <div className="panel panel-pad">
      <h2 style={{ margin: "0 0 1.25rem", fontSize: "1.1rem", fontWeight: 600 }}>
        Projects
      </h2>

      {error && <div className="alert alert-error u-mb-md">{error}</div>}

      {projects.length === 0 ? (
        <p className="u-text-muted">No projects yet. Create one to get started.</p>
      ) : (
        <div className="project-list">
          {projects.map((project) => (
            <div key={project.id} className="project-card">
              {editingProject?.id === project.id ? (
                <form onSubmit={handleUpdate}>
                  <div className="u-mb-md">
                    <strong>{project.name}</strong>{" "}
                    <span className="u-text-muted">({project.id})</span>
                  </div>

                  <div className="u-mb-md">
                    <label className="form-label">Allowed origins</label>
                    {origins.map((origin, index) => (
                      <div key={index} className="origin-row">
                        <input
                          className="input"
                          type="text"
                          value={origin}
                          onChange={(e) => updateOrigin(index, e.target.value)}
                          placeholder={
                            index === 0
                              ? "https://example.com (required)"
                              : "https://another-origin.com"
                          }
                          required={index === 0}
                          aria-label={
                            index === 0
                              ? "Allowed origin (required)"
                              : `Allowed origin ${index + 1}`
                          }
                          spellCheck={false}
                        />
                        {origins.length > 1 && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => removeOriginField(index)}
                            aria-label={`Remove origin ${index + 1}`}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={addOriginField}
                    >
                      + Add origin
                    </button>
                    <span className="form-hint">
                      At least one origin is required. Use wildcards like
                      https://*.example.com (but not just '*')
                    </span>
                  </div>

                  <div className="u-flex u-gap-sm">
                    <button
                      type="submit"
                      className="btn btn-success"
                      disabled={loading}
                    >
                      {loading ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={cancelEdit}
                      disabled={loading}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div className="project-card-top">
                    <div>
                      <div className="project-name">{project.name}</div>
                      <div className="project-meta">ID: {project.id}</div>
                      <div className="project-meta">
                        Created:{" "}
                        {new Date(project.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="project-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => startEdit(project)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-warning btn-sm"
                        onClick={() =>
                          handleClearLogs(project.id, project.name)
                        }
                        disabled={clearingLogsId === project.id}
                      >
                        {clearingLogsId === project.id
                          ? "Clearing…"
                          : "Clear logs"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(project.id)}
                        disabled={deletingId === project.id}
                      >
                        {deletingId === project.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                  <div className="u-mt-sm">
                    <div className="form-label">Allowed origins</div>
                    <div className="tag-row">
                      {project.origins.length === 0 ? (
                        <span className="u-text-muted" style={{ fontStyle: "italic" }}>
                          No origins configured
                        </span>
                      ) : (
                        project.origins.map((origin, index) => (
                          <span key={index} className="tag">
                            {origin}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
