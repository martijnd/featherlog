// Use relative URLs in production (via nginx proxy) or explicit API URL in development
const API_BASE_URL = import.meta.env.VITE_API_URL || "";

export interface LogEntry {
  id: number;
  "project-id": string;
  level: "error" | "warn" | "info";
  message: string;
  timestamp: string;
  metadata: Record<string, any>;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  limit: number;
  offset: number;
}

export interface Project {
  id: string;
  name: string;
  created_at: string;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string) {
    this.token = token;
    localStorage.setItem("auth_token", token);
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem("auth_token");
    }
    return this.token;
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem("auth_token");
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = API_BASE_URL ? `${API_BASE_URL}${endpoint}` : endpoint;
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.clearToken();
      window.location.href = "/";
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Unknown error" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async login(username: string, password: string) {
    const response = await this.request<{
      token: string;
      user: { id: number; username: string };
    }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setToken(response.token);
    return response;
  }

  async register(username: string, password: string) {
    const response = await this.request<{
      token: string;
      user: { id: number; username: string };
      message: string;
    }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    this.setToken(response.token);
    return response;
  }

  async getLogs(
    params: {
      "project-id"?: string;
      level?: "error" | "warn" | "info";
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<LogsResponse> {
    const queryParams = new URLSearchParams();
    if (params["project-id"])
      queryParams.append("project-id", params["project-id"]);
    if (params.level) queryParams.append("level", params.level);
    if (params.startDate) queryParams.append("startDate", params.startDate);
    if (params.endDate) queryParams.append("endDate", params.endDate);
    if (params.limit) queryParams.append("limit", params.limit.toString());
    if (params.offset) queryParams.append("offset", params.offset.toString());

    return this.request<LogsResponse>(`/api/logs?${queryParams.toString()}`);
  }

  async getProjects(): Promise<{ projects: Project[] }> {
    return this.request<{ projects: Project[] }>("/api/logs/projects");
  }

  async createProject(
    id: string,
    name: string,
    secret: string
  ): Promise<{ project: Project }> {
    return this.request<{ project: Project }>("/api/logs/projects", {
      method: "POST",
      body: JSON.stringify({ id, name, secret }),
    });
  }
}

export const apiClient = new ApiClient();
