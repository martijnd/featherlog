import { useEffect, useRef, useState } from "react";

/**
 * Tracks which ids just appeared (e.g. realtime SSE inserts) and returns
 * them for a short flash window. Bulk replacements (filters, pagination)
 * are ignored so the whole table does not flash.
 */
export function useArriveFlash(
  ids: Array<string | number>,
  durationMs = 1500
): Set<string> {
  const [flashing, setFlashing] = useState<Set<string>>(() => new Set());
  const seenRef = useRef<Set<string> | null>(null);
  const timersRef = useRef<Map<string, number>>(new Map());
  const idsKey = ids.map(String).join("\0");

  useEffect(() => {
    const current = new Set(ids.map(String));

    if (seenRef.current === null) {
      seenRef.current = current;
      return;
    }

    const newcomers: string[] = [];
    for (const id of current) {
      if (!seenRef.current.has(id)) newcomers.push(id);
    }
    seenRef.current = current;

    // Full/partial list reloads should not flash every row
    if (
      newcomers.length === 0 ||
      newcomers.length === current.size ||
      newcomers.length > 5
    ) {
      return;
    }

    setFlashing((prev) => {
      const next = new Set(prev);
      for (const id of newcomers) next.add(id);
      return next;
    });

    for (const id of newcomers) {
      const existing = timersRef.current.get(id);
      if (existing) window.clearTimeout(existing);
      const timer = window.setTimeout(() => {
        setFlashing((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        timersRef.current.delete(id);
      }, durationMs);
      timersRef.current.set(id, timer);
    }
  }, [idsKey, durationMs]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  return flashing;
}

export function flashLevelClass(level?: string): string {
  if (level === "error") return "row-flash row-flash-error";
  if (level === "warn") return "row-flash row-flash-warn";
  if (level === "info") return "row-flash row-flash-info";
  return "row-flash";
}

export function flashRowClass(
  flashing: Set<string>,
  id: string | number,
  level?: string
): string {
  if (!flashing.has(String(id))) return "";
  return flashLevelClass(level);
}
