import { useState } from 'react';
import { Project } from '../api/client';

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
  const [draft, setDraft] = useState('');

  const addFilter = () => {
    const value = draft.trim();
    if (!value.includes('=')) return;
    if (whereFilters.includes(value)) {
      setDraft('');
      return;
    }
    onWhereFiltersChange([...whereFilters, value]);
    setDraft('');
  };

  return (
    <div style={{
      backgroundColor: 'white',
      padding: '1.5rem',
      borderRadius: '8px',
      marginBottom: '1rem',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '1rem',
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Project
          </label>
          <select
            value={selectedProject}
            onChange={(e) => onProjectChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          >
            <option value="">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name || project.id}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Level
          </label>
          <select
            value={selectedLevel}
            onChange={(e) => onLevelChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          >
            <option value="">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Start Date
          </label>
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            End Date
          </label>
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
            }}
          />
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '1rem',
        marginBottom: '1rem',
      }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Request ID
          </label>
          <input
            type="text"
            value={requestId}
            onChange={(e) => onRequestIdChange(e.target.value)}
            placeholder="req_8bf7ec2d"
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontFamily: 'monospace',
            }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
            Field filter <span style={{ fontWeight: 400, color: '#6c757d' }}>(path=value)</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFilter();
                }
              }}
              placeholder="user.id=user_456"
              style={{
                flex: 1,
                padding: '0.5rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontFamily: 'monospace',
              }}
            />
            <button
              type="button"
              onClick={addFilter}
              style={{
                padding: '0.5rem 0.75rem',
                backgroundColor: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {whereFilters.length > 0 && (
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}>
          {whereFilters.map((filter) => (
            <span
              key={filter}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.25rem 0.5rem',
                backgroundColor: '#e7f1ff',
                color: '#0d47a1',
                borderRadius: '4px',
                fontFamily: 'monospace',
                fontSize: '0.8rem',
              }}
            >
              {filter}
              <button
                type="button"
                onClick={() =>
                  onWhereFiltersChange(whereFilters.filter((f) => f !== filter))
                }
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#0d47a1',
                  padding: 0,
                  lineHeight: 1,
                  fontSize: '1rem',
                }}
                aria-label={`Remove filter ${filter}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#6c757d' }}>
        Query structured fields — e.g. <code>outcome=error</code>, <code>service=checkout-service</code>,{' '}
        <code>user.subscription=premium</code>
      </p>

      <button
        onClick={() => {
          setDraft('');
          onClearFilters();
        }}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        Clear Filters
      </button>
    </div>
  );
}
