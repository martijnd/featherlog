export interface LogEntry {
  id: number;
  project_id: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
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
  limit?: number;
  offset?: number;
}

