/** Absolute datetime for tooltips / detail views */
export function formatAbsoluteDate(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Short relative time for table cells */
export function formatRelativeDate(
  dateString: string,
  now = Date.now()
): string {
  const date = new Date(dateString);
  const diffMs = now - date.getTime();
  const past = diffMs >= 0;
  const absMs = Math.abs(diffMs);
  const sec = Math.floor(absMs / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  let value: string;
  if (sec < 5) value = "just now";
  else if (sec < 60) value = `${sec}s`;
  else if (min < 60) value = `${min}m`;
  else if (hour < 24) value = `${hour}h`;
  else if (day < 30) value = `${day}d`;
  else {
    return formatAbsoluteDate(dateString);
  }

  if (value === "just now") return value;
  return past ? `${value} ago` : `in ${value}`;
}
