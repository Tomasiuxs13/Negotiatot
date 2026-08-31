/**
 * The creator's category — what their channel is actually about.
 *
 * A managed list rather than free text, because the whole point is grouping: "outdoors",
 * "Outdoor" and "hunting/fishing" typed on three different days are three buckets that
 * each average one deal, which is worth less than nothing. Partner tags stay free-form
 * for everything else; this one field is constrained so Benchmarks can key on it.
 *
 * The list lives in settings, so it is the manager's taxonomy, not ours — these defaults
 * are only a starting point to be edited.
 */
export const DEFAULT_CATEGORIES = [
  "Outdoors & hunting",
  "Fishing",
  "Camping & hiking",
  "Travel",
  "Automotive & overlanding",
  "Tech & gadgets",
  "Home & DIY",
  "Family & lifestyle",
  "Fitness & health",
  "Food & cooking",
  "Gaming",
];

/** No practical limit worth arguing about, just a stop on runaway input. */
const MAX_CATEGORIES = 60;
const MAX_LENGTH = 40;

/**
 * Reads a stored or submitted list into a clean one: trimmed, de-duplicated
 * case-insensitively (first spelling wins), and in the order given.
 */
export function parseCategories(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\n,]/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const name = entry.trim().replace(/\s+/g, " ").slice(0, MAX_LENGTH);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_CATEGORIES) break;
  }
  return out;
}

/**
 * Matches what was picked or typed against the managed list, case-insensitively, and
 * returns the list's own spelling. Anything not on the list is not a category — that
 * refusal is what keeps the buckets from splintering.
 */
export function normalizeCategory(value: unknown, list: string[]): string | null {
  if (typeof value !== "string") return null;
  const needle = value.trim().toLowerCase();
  if (!needle) return null;
  return list.find((entry) => entry.toLowerCase() === needle) ?? null;
}

/**
 * What a category picker should offer. A partner keeps a category that has since been
 * removed from the list — dropping it silently would lose data and quietly re-bucket
 * that creator — so the current value is always offered, marked as retired.
 */
export function categoryOptions(
  list: string[],
  current: string | null | undefined
): { value: string; label: string; retired: boolean }[] {
  const options = list.map((value) => ({ value, label: value, retired: false }));
  if (current && !normalizeCategory(current, list)) {
    options.push({ value: current, label: `${current} (not in list)`, retired: true });
  }
  return options;
}

/** How many creators sit in each category — the number that decides if a bucket is worth having. */
export function categoryUsage(
  list: string[],
  categories: (string | null | undefined)[]
): { category: string; count: number; inList: boolean }[] {
  const counts = new Map<string, number>();
  for (const raw of categories) {
    const name = typeof raw === "string" ? raw.trim() : "";
    if (!name) continue;
    const key = normalizeCategory(name, list) ?? name;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = list.map((category) => ({
    category,
    count: counts.get(category) ?? 0,
    inList: true,
  }));
  // Retired categories still holding creators have to stay visible: they are what a
  // "12 creators" bucket in Benchmarks is made of.
  for (const [category, count] of counts) {
    if (!normalizeCategory(category, list)) rows.push({ category, count, inList: false });
  }
  return rows;
}
