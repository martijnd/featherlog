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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

      await apiClient.createProject(projectId, projectName, validOrigins);
      setIsOpen(false);
      setProjectId("");
      setProjectName("");
      setOrigins([""]);
      setError("");
      onProjectCreated();
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
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setIsOpen(true)}
      >
        + Create project
      </button>
    );
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create project</h2>
          <button
            type="button"
            className="btn-icon"
            onClick={handleClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label className="form-label">Project ID *</label>
            <input
              className="input"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              placeholder="my-project"
            />
            <span className="form-hint">
              Unique identifier for this project (used in SDK)
            </span>
          </div>

          <div className="login-field">
            <label className="form-label">Project name *</label>
            <input
              className="input"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              required
              placeholder="My Project"
            />
          </div>

          <div className="login-field">
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
                />
                {origins.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => removeOriginField(index)}
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

          {error && <div className="alert alert-error u-mb-md">{error}</div>}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
