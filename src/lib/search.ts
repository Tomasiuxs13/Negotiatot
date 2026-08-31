/**
 * Ranking for the global search.
 *
 * SQLite does the filtering with LIKE; this decides the order, because "Joe" should put
 * *Joe Holland Fishing* above a deal whose deliverables happen to contain "joe". A
 * substring match is a match, but it is the weakest kind.
 */
export const SEARCH_MIN_CHARS = 2;

/** What the user typed, reduced to what we actually match on. */
export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/^@+/, "").replace(/\s+/g, " ").toLowerCase();
}

/** 3 = the whole field, 2 = starts with it, 1 = contains it, 0 = no. Best field wins. */
export function scoreMatch(query: string, fields: (string | null | undefined)[]): number {
  const needle = normalizeQuery(query);
  if (!needle) return 0;
  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    const value = field.toLowerCase();
    if (value === needle) return 3;
    if (value.startsWith(needle)) best = Math.max(best, 2);
    else if (value.includes(needle)) best = Math.max(best, 1);
    // A handle rarely starts with the word you remember: "@theoldcoupleoutdoors" is
    // matched by "oldcouple", and that should not rank below an unrelated prefix hit.
    else if (value.replace(/[^a-z0-9]/g, "").includes(needle.replace(/[^a-z0-9]/g, ""))) {
      best = Math.max(best, 1);
    }
  }
  return best;
}

export interface Ranked<T> {
  item: T;
  score: number;
}

/** Highest score first, ties broken by the caller's own order (recency, usually). */
export function rankBy<T>(
  query: string,
  items: T[],
  fields: (item: T) => (string | null | undefined)[]
): T[] {
  const scored: Ranked<T>[] = items.map((item) => ({ item, score: scoreMatch(query, fields(item)) }));
  return scored
    .filter((entry) => entry.score > 0)
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => b.entry.score - a.entry.score || a.index - b.index)
    .map(({ entry }) => entry.item);
}
