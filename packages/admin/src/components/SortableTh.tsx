import type { ReactNode } from "react";

export type SortDir = "asc" | "desc";

export interface SortState<K extends string = string> {
  key: K;
  dir: SortDir;
}

export function toggleSort<K extends string>(
  prev: SortState<K>,
  key: K,
  defaultDir: SortDir = "asc"
): SortState<K> {
  if (prev.key === key) {
    return { key, dir: prev.dir === "asc" ? "desc" : "asc" };
  }
  return { key, dir: defaultDir };
}

export function compareStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}

export function compareNumbers(a: number, b: number): number {
  return a - b;
}

export function compareDates(a: string, b: string): number {
  return new Date(a).getTime() - new Date(b).getTime();
}

export function applySortDir(result: number, dir: SortDir): number {
  return dir === "asc" ? result : -result;
}

interface SortableThProps<K extends string> {
  label: ReactNode;
  column: K;
  sort: SortState<K>;
  onSort: (column: K) => void;
  className?: string;
}

export default function SortableTh<K extends string>({
  label,
  column,
  sort,
  onSort,
  className,
}: SortableThProps<K>) {
  const active = sort.key === column;
  const ariaSort = active
    ? sort.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <th
      className={["th-sortable", className].filter(Boolean).join(" ")}
      aria-sort={ariaSort}
    >
      <button
        type="button"
        className={`th-sort${active ? " is-active" : ""}`}
        onClick={() => onSort(column)}
      >
        <span>{label}</span>
        <span className="th-sort-indicator" aria-hidden="true">
          {active ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </th>
  );
}

/** Click handler that toggles dir on repeat clicks; uses defaultDirs on first activation. */
export function createSortHandler<K extends string>(
  setSort: (updater: (prev: SortState<K>) => SortState<K>) => void,
  defaultDirs?: Partial<Record<K, SortDir>>
) {
  return (column: K) => {
    setSort((prev) => toggleSort(prev, column, defaultDirs?.[column] ?? "asc"));
  };
}
