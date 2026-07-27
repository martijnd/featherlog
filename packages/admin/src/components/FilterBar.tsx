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
  const [filterHint, setFilterHint] = useState<string | null>(null);

  const addFilter = () => {
    const value = draft.trim();
    if (!value) return;
    if (!value.includes("=")) {
      setFilterHint("Use path=value, e.g. service=checkout-service");
      return;
    }
    if (whereFilters.includes(value)) {
      setDraft("");
      setFilterHint(null);
      return;
    }
    onWhereFiltersChange([...whereFilters, value]);
    setDraft("");
    setFilterHint(null);
  };

  return (
    <div className="panel panel-pad u-mb-md">
      <div className="filter-grid">
        <div>
          <label className="form-label" htmlFor="filter-project">
            Project
          </label>
          <select
            id="filter-project"
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
          <label className="form-label" htmlFor="filter-level">
            Level
          </label>
          <select
            id="filter-level"
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
          <label className="form-label" htmlFor="filter-start-date">
            Start date
          </label>
          <input
            id="filter-start-date"
            className="input"
            type="datetime-local"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="filter-end-date">
            End date
          </label>
          <input
            id="filter-end-date"
            className="input"
            type="datetime-local"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
          />
        </div>
      </div>

      <div className="filter-grid">
        <div>
          <label className="form-label" htmlFor="filter-request-id">
            Request ID
          </label>
          <input
            id="filter-request-id"
            className="input input-mono"
            type="text"
            value={requestId}
            onChange={(e) => onRequestIdChange(e.target.value)}
            placeholder="req_8bf7ec2d"
            spellCheck={false}
          />
        </div>
        <div>
          <label className="form-label" htmlFor="filter-where">
            Field filter{" "}
            <span className="u-text-muted" style={{ fontWeight: 400 }}>
              (path=value)
            </span>
          </label>
          <div className="u-flex filter-add-row">
            <input
              id="filter-where"
              className="input input-mono"
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (filterHint) setFilterHint(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addFilter();
                }
              }}
              placeholder="user.id=user_456"
              spellCheck={false}
              aria-invalid={filterHint ? true : undefined}
              aria-describedby={filterHint ? "filter-where-hint" : undefined}
            />
            <button type="button" className="btn btn-primary" onClick={addFilter}>
              Add
            </button>
          </div>
          {filterHint && (
            <p id="filter-where-hint" className="form-hint is-error" role="alert">
              {filterHint}
            </p>
          )}
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
          setFilterHint(null);
          onClearFilters();
        }}
      >
        Clear filters
      </button>
    </div>
  );
}
