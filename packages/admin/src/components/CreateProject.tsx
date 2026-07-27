import { useEffect, useId, useRef, useState } from "react";
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
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const idFieldId = useId();
  const nameFieldId = useId();

  const handleClose = () => {
    setIsOpen(false);
    setProjectId("");
    setProjectName("");
    setOrigins([""]);
    setError("");
  };

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialogRef.current?.querySelector<HTMLElement>("input")?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen]);

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
      handleClose();
      onProjectCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
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
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id={titleId}>Create project</h2>
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
            <label className="form-label" htmlFor={idFieldId}>
              Project ID *
            </label>
            <input
              id={idFieldId}
              className="input"
              type="text"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              required
              placeholder="my-project"
              spellCheck={false}
            />
            <span className="form-hint">
              Unique identifier for this project (used in SDK)
            </span>
          </div>

          <div className="login-field">
            <label className="form-label" htmlFor={nameFieldId}>
              Project name *
            </label>
            <input
              id={nameFieldId}
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
