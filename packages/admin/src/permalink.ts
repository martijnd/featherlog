export type AdminView = "dashboard" | "logs" | "issues" | "projects";

export type LogLevelFilter = "" | "error" | "warn" | "info";

export interface LogsFilterState {
  projectId: string;
  level: LogLevelFilter;
  startDate: string;
  endDate: string;
  requestId: string;
  where: string[];
  /** Case-insensitive message substring */
  q: string;
}

export const emptyLogsFilters = (): LogsFilterState => ({
  projectId: "",
  level: "",
  startDate: "",
  endDate: "",
  requestId: "",
  where: [],
  q: "",
});

export type AdminRoute =
  | { kind: "share"; token: string }
  | { kind: "dashboard" }
  | { kind: "logs"; filters: LogsFilterState }
  | { kind: "log"; id: number }
  | { kind: "issues" }
  | { kind: "issue"; fingerprint: string; projectId: string }
  | { kind: "projects" }
  | { kind: "unknown" };

function parseSearchParams(search: string): URLSearchParams {
  return new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search
  );
}

export function parseLogsSearch(search: string): LogsFilterState {
  const params = parseSearchParams(search);
  const levelRaw = params.get("level")?.trim() || "";
  const level: LogLevelFilter =
    levelRaw === "error" || levelRaw === "warn" || levelRaw === "info"
      ? levelRaw
      : "";

  return {
    projectId: params.get("project")?.trim() || "",
    level,
    startDate: params.get("start")?.trim() || "",
    endDate: params.get("end")?.trim() || "",
    requestId: params.get("request_id")?.trim() || "",
    where: params
      .getAll("where")
      .map((clause) => clause.trim())
      .filter(Boolean),
    q: params.get("q")?.trim() || "",
  };
}

export function pathForLogs(filters: LogsFilterState = emptyLogsFilters()): string {
  const params = new URLSearchParams();
  if (filters.projectId) params.set("project", filters.projectId);
  if (filters.level) params.set("level", filters.level);
  if (filters.startDate) params.set("start", filters.startDate);
  if (filters.endDate) params.set("end", filters.endDate);
  if (filters.requestId) params.set("request_id", filters.requestId);
  if (filters.q) params.set("q", filters.q);
  for (const clause of filters.where) {
    if (clause.trim()) params.append("where", clause.trim());
  }
  const qs = params.toString();
  return qs ? `/logs?${qs}` : "/logs";
}

export function logsViewPermalink(
  filters: LogsFilterState = emptyLogsFilters()
): string {
  return `${window.location.origin}${pathForLogs(filters)}`;
}

export function hasActiveLogsFilters(filters: LogsFilterState): boolean {
  return Boolean(
    filters.projectId ||
      filters.level ||
      filters.startDate ||
      filters.endDate ||
      filters.requestId ||
      filters.q ||
      filters.where.length > 0
  );
}

export function parseAdminRoute(
  pathname: string,
  search: string = ""
): AdminRoute {
  const path = pathname.replace(/\/+$/, "") || "/";

  const shareMatch = path.match(/^\/share\/([^/]+)$/);
  if (shareMatch) {
    try {
      return { kind: "share", token: decodeURIComponent(shareMatch[1]) };
    } catch {
      return { kind: "share", token: shareMatch[1] };
    }
  }

  if (path === "/") return { kind: "dashboard" };
  if (path === "/logs") {
    return { kind: "logs", filters: parseLogsSearch(search) };
  }
  if (path === "/projects") return { kind: "projects" };
  if (path === "/issues") return { kind: "issues" };

  const logMatch = path.match(/^\/logs\/(\d+)$/);
  if (logMatch) {
    const id = parseInt(logMatch[1], 10);
    if (Number.isInteger(id) && id > 0) {
      return { kind: "log", id };
    }
  }

  const issueMatch = path.match(/^\/issues\/([^/]+)$/);
  if (issueMatch) {
    const params = parseSearchParams(search);
    const projectId = params.get("project")?.trim() || "";
    if (!projectId) return { kind: "issues" };
    let fingerprint = issueMatch[1];
    try {
      fingerprint = decodeURIComponent(fingerprint);
    } catch {
      // keep raw
    }
    return { kind: "issue", fingerprint, projectId };
  }

  return { kind: "unknown" };
}

export function pathForView(view: AdminView): string {
  switch (view) {
    case "dashboard":
      return "/";
    case "logs":
      return "/logs";
    case "issues":
      return "/issues";
    case "projects":
      return "/projects";
  }
}

export function pathForLog(id: number): string {
  return `/logs/${id}`;
}

export function pathForIssue(fingerprint: string, projectId: string): string {
  return `/issues/${encodeURIComponent(fingerprint)}?project=${encodeURIComponent(projectId)}`;
}

export function logPermalink(id: number): string {
  return `${window.location.origin}${pathForLog(id)}`;
}

export function issuePermalink(fingerprint: string, projectId: string): string {
  return `${window.location.origin}${pathForIssue(fingerprint, projectId)}`;
}

export function navigatePath(path: string, replace = false): void {
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === path) return;
  if (replace) {
    window.history.replaceState(null, "", path);
  } else {
    window.history.pushState(null, "", path);
  }
}
