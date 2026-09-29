import { useTheme } from "../useTheme";

const NEXT_LABEL: Record<"system" | "light" | "dark", string> = {
  system: "light",
  light: "dark",
  dark: "system",
};

export default function ThemeToggle() {
  const { resolved, preference, cyclePreference } = useTheme();
  const isDark = resolved === "dark";

  const preferenceLabel =
    preference === "system"
      ? `System (${isDark ? "dark" : "light"})`
      : preference === "light"
        ? "Light"
        : "Dark";

  const title = `Theme: ${preferenceLabel}. Click for ${NEXT_LABEL[preference]}.`;

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm theme-toggle${preference === "system" ? " is-system" : ""}`}
      onClick={cyclePreference}
      title={title}
      aria-label={title}
    >
      <span className="theme-toggle-icon" aria-hidden>
        {preference === "system" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 3a9 9 0 0 1 0 18V3z" fill="currentColor" stroke="none" />
          </svg>
        ) : preference === "light" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        )}
      </span>
    </button>
  );
}
