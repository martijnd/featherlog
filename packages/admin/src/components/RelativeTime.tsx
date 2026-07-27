import { formatAbsoluteDate, formatRelativeDate } from "../time";

interface RelativeTimeProps {
  value: string;
  className?: string;
}

/** Relative timestamp with absolute datetime on hover. */
export default function RelativeTime({ value, className }: RelativeTimeProps) {
  const absolute = formatAbsoluteDate(value);
  const classes = ["relative-time", className].filter(Boolean).join(" ");

  return (
    <time
      className={classes}
      dateTime={value}
      aria-label={absolute}
      data-absolute={absolute}
    >
      {formatRelativeDate(value)}
    </time>
  );
}
