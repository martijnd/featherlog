export type AdminView = "dashboard" | "logs" | "issues" | "projects";

export type AdminRoute =
  | { kind: "share"; token: string }
  | { kind: "dashboard" }
  | { kind: "logs" }
  | { kind: "log"; id: number }
  | { kind: "issues" }
  | { kind: "issue"; fingerprint: string; projectId: string }
  | { kind: "projects" }
  | { kind: "unknown" };

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
  if (path === "/logs") return { kind: "logs" };
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
    const params = new URLSearchParams(
      search.startsWith("?") ? search.slice(1) : search
    );
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
