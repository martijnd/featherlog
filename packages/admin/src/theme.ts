export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "featherlog-theme";

export function getStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* ignore */
  }
  return "system";
}

export function setStoredPreference(preference: ThemePreference): void {
  try {
    if (preference === "system") {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, preference);
    }
  } catch {
    /* ignore */
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "dark") return "dark";
  if (preference === "light") return "light";
  return systemPrefersDark() ? "dark" : "light";
}

export function applyResolvedTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute(
      "content",
      resolved === "dark" ? "#121110" : "#fafaf9"
    );
  }
}

export function initTheme(): ThemePreference {
  const preference = getStoredPreference();
  applyResolvedTheme(resolveTheme(preference));
  return preference;
}

export function subscribeSystemTheme(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const handler = () => onChange();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/** Read chart tokens from CSS (updates when theme changes). */
export function readChartColors(): {
  error: string;
  warn: string;
  info: string;
  grid: string;
  tick: string;
} {
  const style = getComputedStyle(document.documentElement);
  return {
    error: style.getPropertyValue("--chart-error").trim() || "#c81e4a",
    warn: style.getPropertyValue("--chart-warn").trim() || "#d97706",
    info: style.getPropertyValue("--chart-info").trim() || "#0284c7",
    grid: style.getPropertyValue("--chart-grid").trim() || "#e7e5e4",
    tick: style.getPropertyValue("--chart-tick").trim() || "#78716c",
  };
}
