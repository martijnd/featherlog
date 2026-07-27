/** Level → badge CSS class helpers shared across admin views */

export function levelBadgeClass(level: string): string {
  switch (level) {
    case "error":
      return "badge badge-error";
    case "warn":
      return "badge badge-warn";
    case "info":
      return "badge badge-info";
    default:
      return "badge badge-muted";
  }
}

export function issueStatusBadgeClass(status: string): string {
  return status === "resolved" ? "badge badge-resolved" : "badge badge-open";
}

/** Chart series colors matching CSS tokens */
export const chartColors = {
  error: "#c81e4a",
  warn: "#d97706",
  info: "#0284c7",
  grid: "#e5e7eb",
  tick: "#6b7280",
} as const;
