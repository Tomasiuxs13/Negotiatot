export type SortDir = "asc" | "desc";

/**
 * Comparator that keeps missing values out of the way.
 *
 * A deal with no agreed price isn't "cheapest" and a partner with no CPM isn't "best" —
 * blanks sort to the bottom whichever direction you pick, so the top of the table is
 * always the rows that actually answer the question.
 */
export function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  const aMissing = a == null || a === "";
  const bMissing = b == null || b === "";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  let result: number;
  if (typeof a === "number" && typeof b === "number") {
    result = a - b;
  } else {
    result = String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  }
  return dir === "asc" ? result : -result;
}

/** Sorts a copy by one extracted key, leaving the input untouched. */
export function sortBy<T>(
  rows: T[],
  extract: (row: T) => unknown,
  dir: SortDir = "asc"
): T[] {
  return [...rows].sort((a, b) => compareValues(extract(a), extract(b), dir));
}

/** Flips direction, so clicking the active column reverses it. */
export function nextDir(active: boolean, current: SortDir): SortDir {
  return active ? (current === "asc" ? "desc" : "asc") : "desc";
}

/**
 * Builds a URL that keeps the filters you already have and changes only what you asked
 * for. Empty values drop out, so links stay short and a cleared filter really clears.
 */
export function buildQuery(
  path: string,
  current: Record<string, string | undefined>,
  changes: Record<string, string>,
  defaults: Record<string, string> = {}
): string {
  const merged = { ...current, ...changes };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (!value) continue;
    if (defaults[key] === value) continue;
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
