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
      // Filter out empty origins
      const validOrigins = origins.filter((origin) => origin.trim() !== "");

      // Require at least one origin
      if (validOrigins.length === 0) {
        setError("At least one origin is required");
        setLoading(false);
        return;
      }

      // Disallow '*' as a single origin to prevent abuse
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
    if (!confirm(`Are you sure you want to delete project "${projectId}"? This will also delete all associated logs.`)) {
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
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "8px",
        padding: "1.5rem",
        boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "1.5rem" }}>Projects</h2>

      {error && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            backgroundColor: "#fee",
            color: "#c33",
            borderRadius: "4px",
          }}
        >
          {error}
        </div>
      )}

      {projects.length === 0 ? (
        <p style={{ color: "#666" }}>No projects yet. Create one to get started.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {projects.map((project) => (
            <div
              key={project.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "4px",
                padding: "1rem",
              }}
            >
              {editingProject?.id === project.id ? (
                <form onSubmit={handleUpdate}>
                  <div style={{ marginBottom: "1rem" }}>
                    <strong>{project.name}</strong> ({project.id})
                  </div>

                  <div style={{ marginBottom: "1rem" }}>
                    <label
                      style={{
                        display: "block",
                        marginBottom: "0.5rem",
                        fontWeight: "500",
                      }}
                    >
                      Allowed Origins
                    </label>
                    {origins.map((origin, index) => (
                      <div
                        key={index}
                        style={{
                          display: "flex",
                          gap: "0.5rem",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <input
                          type="text"
                          value={origin}
                          onChange={(e) => updateOrigin(index, e.target.value)}
                          placeholder={
                            index === 0
                              ? "https://example.com (required)"
                              : "https://another-origin.com"
                          }
                          required={index === 0}
                          style={{
                            flex: 1,
                            padding: "0.75rem",
                            border: "1px solid #ddd",
                            borderRadius: "4px",
                            fontSize: "1rem",
                          }}
                        />
                        {origins.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeOriginField(index)}
                            style={{
                              padding: "0.75rem",
                              backgroundColor: "#dc3545",
                              color: "white",
                              border: "none",
                              borderRadius: "4px",
                              cursor: "pointer",
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addOriginField}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#6c757d",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                      }}
                    >
                      + Add Origin
                    </button>
                    <small
                      style={{
                        color: "#666",
                        fontSize: "0.875rem",
                        display: "block",
                        marginTop: "0.5rem",
                      }}
                    >
                      At least one origin is required. Use wildcards like
                      https://*.example.com (but not just '*')
                    </small>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="submit"
                      disabled={loading}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#28a745",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.6 : 1,
                      }}
                    >
                      {loading ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={loading}
                      style={{
                        padding: "0.5rem 1rem",
                        backgroundColor: "#6c757d",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: "0.5rem",
                    }}
                  >
                    <div>
                      <strong>{project.name}</strong>
                      <div style={{ color: "#666", fontSize: "0.875rem" }}>
                        ID: {project.id}
                      </div>
                      <div style={{ color: "#666", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                        Created: {new Date(project.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => startEdit(project)}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: "#17a2b8",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "0.875rem",
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(project.id)}
                        disabled={deletingId === project.id}
                        style={{
                          padding: "0.5rem 1rem",
                          backgroundColor: "#dc3545",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: deletingId === project.id ? "not-allowed" : "pointer",
                          opacity: deletingId === project.id ? 0.6 : 1,
                          fontSize: "0.875rem",
                        }}
                      >
                        {deletingId === project.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: "0.75rem" }}>
                    <div style={{ fontSize: "0.875rem", fontWeight: "500", marginBottom: "0.25rem" }}>
                      Allowed Origins:
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                      {project.origins.length === 0 ? (
                        <span style={{ color: "#999", fontStyle: "italic" }}>
                          No origins configured
                        </span>
                      ) : (
                        project.origins.map((origin, index) => (
                          <span
                            key={index}
                            style={{
                              padding: "0.25rem 0.75rem",
                              backgroundColor: "#e9ecef",
                              borderRadius: "4px",
                              fontSize: "0.875rem",
                            }}
                          >
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

