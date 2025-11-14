import { LogEntry } from '../api/client';

interface LogsTableProps {
  logs: LogEntry[];
  loading: boolean;
  total: number;
  limit: number;
  offset: number;
  onPageChange: (offset: number) => void;
}

export default function LogsTable({
  logs,
  loading,
  total,
  limit,
  offset,
  onPageChange,
}: LogsTableProps) {
  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return '#dc3545';
      case 'warn':
        return '#ffc107';
      case 'info':
        return '#17a2b8';
      default:
        return '#6c757d';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        overflow: 'hidden',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      }}>
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}>No logs found</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Timestamp</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Project</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Level</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Message</th>
                <th style={{ padding: '1rem', textAlign: 'left', fontWeight: '600' }}>Metadata</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                  <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                    {formatDate(log.timestamp)}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                    {log['project-id']}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '4px',
                        backgroundColor: getLevelColor(log.level),
                        color: 'white',
                        fontSize: '0.875rem',
                        fontWeight: '500',
                      }}
                    >
                      {log.level.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem', maxWidth: '400px', wordBreak: 'break-word' }}>
                    {log.message}
                  </td>
                  <td style={{ padding: '1rem', fontSize: '0.9rem' }}>
                    {Object.keys(log.metadata || {}).length > 0 ? (
                      <details>
                        <summary style={{ cursor: 'pointer', color: '#007bff' }}>
                          View ({Object.keys(log.metadata).length} keys)
                        </summary>
                        <pre style={{
                          marginTop: '0.5rem',
                          padding: '0.5rem',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          overflow: 'auto',
                        }}>
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span style={{ color: '#6c757d' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div style={{
          marginTop: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        }}>
          <div>
            Showing {offset + 1} to {Math.min(offset + limit, total)} of {total} logs
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => onPageChange(Math.max(0, offset - limit))}
              disabled={offset === 0}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: offset === 0 ? '#e9ecef' : '#007bff',
                color: offset === 0 ? '#6c757d' : 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: offset === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              Previous
            </button>
            <span style={{ padding: '0.5rem' }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange(offset + limit)}
              disabled={offset + limit >= total}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: offset + limit >= total ? '#e9ecef' : '#007bff',
                color: offset + limit >= total ? '#6c757d' : 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: offset + limit >= total ? 'not-allowed' : 'pointer',
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

