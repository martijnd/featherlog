export interface LogEntry {
  id: number;
  project_id: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
  fingerprint?: string | null;
}

export type IssueStatus = 'open' | 'resolved';

export interface Issue {
  fingerprint: string;
  project_id: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  count: number;
  first_seen: Date;
  last_seen: Date;
  latest_metadata: Record<string, any>;
  status: IssueStatus;
  resolved_at: Date | null;
}

export interface LogRequest {
  'project-id': string;
  level: 'error' | 'warn' | 'info';
  message: string;
  timestamp?: string;
  [key: string]: any;
}

export interface Project {
  id: string;
  name: string;
  origins: string[];
}

export interface User {
  id: number;
  username: string;
  password_hash: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LogsQueryParams {
  'project-id'?: string;
  level?: 'error' | 'warn' | 'info';
  startDate?: string;
  endDate?: string;
  /**
   * Structured field filters: "path=value" (e.g. "user.id=user_456", "outcome=error").
   * May be a single string or array when repeated as query params.
   */
  where?: string | string[];
  /** Convenience shorthand for where request_id=... */
  request_id?: string;
  /** Case-insensitive substring match against log message */
  q?: string;
  /** Sort column: timestamp | project | level | message | metadata */
  sort?: string;
  /** Sort direction: asc | desc */
  order?: string;
  limit?: number;
  offset?: number;
}

