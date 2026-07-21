import type { ContentItem } from "./fulfillment-types";

/**
 * How long each platform needs before a view count means anything.
 *
 * The curves differ enough that one number would be wrong everywhere: stories expire
 * within a day, TikTok mostly lands in a week but the feed can resurface a video, and
 * a YouTube integration keeps accruing for months. Reading too early doesn't just
 * understate the deal — it poisons the CPM baseline every later negotiation is priced
 * against.
 */
export const DEFAULT_WINDOWS: Record<string, number> = {
  youtube: 30,
  instagram: 14,
  tiktok: 14,
};

/** Fallback for a platform we don't know — long enough to be safe, short enough to matter. */
export const FALLBACK_WINDOW = 14;

export type MeasurementWindows = Record<string, number>;

export function windowFor(platform: string | null, windows: MeasurementWindows = {}): number {
  if (!platform) return windows.default ?? FALLBACK_WINDOW;
  return windows[platform] ?? DEFAULT_WINDOWS[platform] ?? FALLBACK_WINDOW;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(to.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

export type MeasurementState =
  /** Not live yet — nothing to measure. */
  | "not_posted"
  /** Live, but too new for the number to be trustworthy. */
  | "maturing"
  /** Old enough to measure, and nobody has. */
  | "due"
  /** Measured before the window closed — usable as a signal, not as a benchmark. */
  | "provisional"
  /** Measured after the window closed. This is what calibrates the playbook. */
  | "final";

export interface Measurement {
  state: MeasurementState;
  /** Date the platform's window closes, if the item is live. */
  matureOn: string | null;
  daysSincePost: number | null;
  daysUntilMature: number | null;
  windowDays: number;
}

/**
 * Where one deliverable sits between "just posted" and "safe to benchmark".
 *
 * Items posted before this was tracked have no posted_at, so their readings are taken
 * at face value — better than retroactively discarding real history.
 */
export function measurementState(
  item: Pick<ContentItem, "platform" | "status" | "posted_at" | "actual_views" | "actuals_measured_at">,
  windows: MeasurementWindows = {},
  today = new Date().toISOString().slice(0, 10)
): Measurement {
  const windowDays = windowFor(item.platform, windows);
  const measured = item.actual_views != null;
  const isLive = item.status === "posted" || item.status === "verified";

  if (!item.posted_at) {
    return {
      state: measured ? "final" : isLive ? "due" : "not_posted",
      matureOn: null,
      daysSincePost: null,
      daysUntilMature: null,
      windowDays,
    };
  }

  const matureOn = addDays(item.posted_at, windowDays);
  const daysSincePost = daysBetween(item.posted_at, today);
  const daysUntilMature = daysBetween(today, matureOn);

  if (measured) {
    const measuredOn = item.actuals_measured_at ?? today;
    const state: MeasurementState = measuredOn >= matureOn ? "final" : "provisional";
    return { state, matureOn, daysSincePost, daysUntilMature, windowDays };
  }

  return {
    state: daysUntilMature <= 0 ? "due" : "maturing",
    matureOn,
    daysSincePost,
    daysUntilMature,
    windowDays,
  };
}

/** Only settled numbers should shape the baseline you price future deals against. */
export function countsTowardBenchmarks(m: Measurement): boolean {
  return m.state === "final";
}

export const MEASUREMENT_LABEL: Record<MeasurementState, string> = {
  not_posted: "Not posted",
  maturing: "Too early to measure",
  due: "Ready to measure",
  provisional: "Provisional",
  final: "Final",
};
