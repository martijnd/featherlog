export function BrandMark({ className = "app-brand-mark" }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        fill="currentColor"
        width="30"
        height="30"
      >
        <path d="M12 46 L26 8 h7 L28.5 24 L38 6 h7 L37 23 L48 12 l5.5 5 L40 34 L46 46 h-7.5 L35 31 L28 46 h-7 L29 28 Z" />
        <rect x="12" y="50" width="40" height="3" rx="1" opacity="0.28" />
      </svg>
    </span>
  );
}

export function BrandWordmark({
  showTag = false,
  size = "sm",
}: {
  showTag?: boolean;
  size?: "sm" | "lg";
}) {
  return (
    <span className={`app-brand-wordmark${size === "lg" ? " is-lg" : ""}`}>
      <span className="app-brand-name">
        Feather<span className="brand-log">log</span>
      </span>
      {showTag && <span className="app-brand-tag">Error tracking</span>}
    </span>
  );
}
