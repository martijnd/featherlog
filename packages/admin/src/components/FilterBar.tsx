import { useState } from "react";
import { Project } from "../api/client";

interface FilterBarProps {
  projects: Project[];
  selectedProject: string;
  selectedLevel: string;
  startDate: string;
  endDate: string;
  requestId: string;
  whereFilters: string[];
  onProjectChange: (projectId: string) => void;
  onLevelChange: (level: string) => void;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  onRequestIdChange: (requestId: string) => void;
  onWhereFiltersChange: (filters: string[]) => void;
  onClearFilters: () => void;
}

export default function FilterBar({
  projects,
  selectedProject,
  selectedLevel,
  startDate,
  endDate,
  requestId,
  whereFilters,
  onProjectChange,
  onLevelChange,
  onStartDateChange,
  onEndDateChange,
  onRequestIdChange,
  onWhereFiltersChange,
  onClearFilters,
}: FilterBarProps) {
  const [draft, setDraft] = useState("");

  const addFilter = () => {
    const value = draft.trim();
    if (!value.includes("=")) return;
    if (whereFilters.includes(value)) {
      setDraft("");
      return;
    }
    onWhereFiltersChange([...whereFilters, value]);
    setDraft("");
  };

  return (
    <div className="panel panel-pad u-mb-md">
      <div className="filter-grid">
        <div>
          <label className="form-label">Project</label>
          <select
            className="select"
            value={selectedProject}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name || project.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">Level</label>
          <select
            className="select"
            value={selectedLevel}
            onChange={(e) => onLevelChange(e.target.value)}
          >
            <option value="">All levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div>
          <label className="form-label">Start date</label>
          <input
            className="input"
            type="datetime-local"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label">End date</label>
          <input
            className="input"
            type="datetime-local"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </div>
      </div>

      <div className="filter-grid">
        <div>
          <label className="form-label">Request ID</label>
          <input
            className="input input-mono"
            type="text"
            value={requestId}
            onChange={(e) => onRequestIdChange(e.target.value)}
            placeholder="req_8bf7ec2d"
          />
        </div>
        <div>
          <label className="form-label">
            Field filter{" "}
            <span className="u-text-muted" style={{ fontWeight: 400 }}>
              (path=value)
            </span>
          </label>
          <div className="u-flex filter-add-row">
            <input
              className="input input-mono"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFilter();
                }
              }}
              placeholder="user.id=user_456"
            />
            <button type="button" className="btn btn-primary" onClick={addFilter}>
              Add
            </button>
          </div>
        </div>
      </div>

      {whereFilters.length > 0 && (
        <div className="chip-row">
          {whereFilters.map((filter) => (
            <span key={filter} className="chip">
              {filter}
              <button
                type="button"
                className="chip-btn"
                onClick={() =>
                  onWhereFiltersChange(whereFilters.filter((f) => f !== filter))
                }
                aria-label={`Remove filter ${filter}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="help-text">
        Query structured fields — e.g. <code>outcome=error</code>,{" "}
        <code>service=checkout-service</code>,{" "}
        <code>user.subscription=premium</code>
      </p>

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => {
          setDraft("");
          onClearFilters();
        }}
      >
        Clear filters
      </button>
    </div>
  );
}
