import { useState } from "react";
import { apiClient } from "../api/client";

interface CreateProjectProps {
  onProjectCreated: () => void;
}

export default function CreateProject({
  onProjectCreated,
}: CreateProjectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [origins, setOrigins] = useState<string[]>([""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
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

      await apiClient.createProject(projectId, projectName, validOrigins);
      setSuccess(true);
      setProjectId("");
      setProjectName("");
      setOrigins([""]);
      onProjectCreated();
      setTimeout(() => {
        setIsOpen(false);
        setSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setProjectId("");
    setProjectName("");
    setOrigins([""]);
    setError("");
    setSuccess(false);
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          padding: "0.5rem 1rem",
          backgroundColor: "#28a745",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "0.9rem",
        }}
      >
        + Create Project
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: "white",
          padding: "2rem",
          borderRadius: "8px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
          width: "90%",
          maxWidth: "500px",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          <h2 style={{ margin: 0 }}>Create New Project</h2>
          <button
            onClick={handleClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.5rem",
              cursor: "pointer",
              color: "#666",
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Project ID *
            </label>
            <input
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              placeholder="my-project"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "1rem",
              }}
            />
            <small style={{ color: "#666", fontSize: "0.875rem" }}>
              Unique identifier for this project (used in SDK)
            </small>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            <label
              style={{
                display: "block",
                marginBottom: "0.5rem",
                fontWeight: "500",
              }}
            >
              Project Name *
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
              placeholder="My Project"
              style={{
                width: "100%",
                padding: "0.75rem",
                border: "1px solid #ddd",
                borderRadius: "4px",
                fontSize: "1rem",
              }}
            />
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

          {success && (
            <div
              style={{
                marginBottom: "1rem",
                padding: "0.75rem",
                backgroundColor: "#efe",
                color: "#3c3",
                borderRadius: "4px",
              }}
            >
              Project created successfully!
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={handleClose}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "0.75rem 1.5rem",
                backgroundColor: "#28a745",
                color: "white",
                border: "none",
                borderRadius: "4px",
                fontSize: "1rem",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Creating..." : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
