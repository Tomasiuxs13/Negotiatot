/**
 * The month view of the same content the board shows.
 *
 * A board answers "what is stuck"; a calendar answers "what lands when, and does any of
 * it collide". Those are different questions, which is why this is a third view rather
 * than a prettier list — the one thing only a calendar can show is two videos from the
 * same creator landing three days apart, and that is worth catching before it is agreed.
 *
 * Pure: no database import, so the grid and the conflict rules are testable.
 */

import type { ContentItem } from "./fulfillment-types";
import { DEFAULT_DRAFT_LEAD_DAYS, draftDueDate } from "./timeline";
import type { ContentRow } from "./content-queue";

/** Days between two same-creator publish slots below which they read as one blur. */
export const DEFAULT_MIN_GAP_DAYS = 7;

/**
 * When this item lands, in fact or in plan. A posted item's real publication date beats
 * whatever was agreed — the calendar should show what happened, not what was promised.
 */
export function landsOn(item: ContentItem): string | null {
  if (item.status === "posted" || item.status === "verified") {
    return item.posted_at?.slice(0, 10) ?? item.due_date;
  }
  return item.due_date;
}

/** A marker on a day: either the publish slot itself, or the draft deadline before it. */
export interface CalendarEntry {
  row: ContentRow;
  kind: "publish" | "draft";
}

/**
 * Every dated marker, keyed by day. Draft deadlines are included because they are the
 * dates you can still act on — by the time a publish slot is visible on the calendar,
 * the only thing left to do about it is hope.
 */
export function calendarEntries(
  rows: ContentRow[],
  leadDays = DEFAULT_DRAFT_LEAD_DAYS
): Map<string, CalendarEntry[]> {
  const byDay = new Map<string, CalendarEntry[]>();
  const push = (day: string, entry: CalendarEntry) => {
    const list = byDay.get(day);
    if (list) list.push(entry);
    else byDay.set(day, [entry]);
  };

  for (const row of rows) {
    const lands = landsOn(row.item);
    if (lands) push(lands, { row, kind: "publish" });
    // Only while a draft is still owed — a deadline that has already been met is history.
    if (
      row.item.due_date &&
      (row.item.status === "planned" || row.item.status === "in_production")
    ) {
      push(draftDueDate(row.item.due_date, leadDays), { row, kind: "draft" });
    }
  }
  return byDay;
}

/* ------------------------------------------------------------------ the grid */

function toUtc(day: string): Date {
  return new Date(day.slice(0, 10) + "T00:00:00Z");
}

function toDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysUtc(day: string, days: number): string {
  return toDay(new Date(toUtc(day).getTime() + days * 86_400_000));
}

/** Whole days between two dates. Negative when `to` is earlier than `from`. */
export function dayGap(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

/** Moves a YYYY-MM month string by whole months, wrapping the year correctly. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  // Month index is 0-based here, so (m - 1 + delta) lets Date normalise the year for us.
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Six weeks of Monday-start days covering the month, padded with the neighbouring
 * months' days so the grid is always rectangular. A fixed six rows means the calendar
 * doesn't change height as you page through months, which is what makes paging readable.
 */
export function monthGrid(month: string): string[][] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  // getUTCDay is Sunday-0; shift so Monday is the first column.
  const lead = (first.getUTCDay() + 6) % 7;
  const start = toDay(new Date(first.getTime() - lead * 86_400_000));

  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) week.push(addDaysUtc(start, w * 7 + d));
    weeks.push(week);
  }
  return weeks;
}

export function isInMonth(day: string, month: string): boolean {
  return day.slice(0, 7) === month;
}

/* ------------------------------------------------------- spacing conflicts */

export interface SpacingConflict {
  creator: string;
  /** Every item in the cramped stretch, in date order. Always two or more. */
  items: ContentRow[];
  firstDay: string;
  lastDay: string;
  /** The tightest gap inside the cluster — zero when two land on the same day. */
  tightestGapDays: number;
}

/**
 * Same creator, publish slots closer together than the minimum gap.
 *
 * Reported as clusters rather than pairs. A three-video bundle logged against one date
 * is one problem — "three land the same day" — not two separate collisions, and pairwise
 * reporting turns a single crowded week into a wall of near-identical warnings. Adjacent
 * items chain into the same cluster, so a run of videos every three days reads as one
 * cramped stretch, which is what it is.
 *
 * Already-posted items count too: a clash you shipped is still worth seeing, because it
 * is the reason two videos underperformed.
 */
export function spacingConflicts(
  rows: ContentRow[],
  minGapDays = DEFAULT_MIN_GAP_DAYS
): SpacingConflict[] {
  const byCreator = new Map<string, { row: ContentRow; day: string }[]>();
  for (const row of rows) {
    const day = landsOn(row.item);
    if (!day) continue;
    const list = byCreator.get(row.creator);
    if (list) list.push({ row, day });
    else byCreator.set(row.creator, [{ row, day }]);
  }

  const conflicts: SpacingConflict[] = [];
  for (const [creator, list] of byCreator) {
    list.sort((x, z) => (x.day < z.day ? -1 : x.day > z.day ? 1 : x.row.item.id - z.row.item.id));

    let cluster = [list[0]];
    const flush = () => {
      if (cluster.length < 2) return;
      let tightest = Infinity;
      for (let i = 1; i < cluster.length; i++) {
        tightest = Math.min(tightest, dayGap(cluster[i - 1].day, cluster[i].day));
      }
      conflicts.push({
        creator,
        items: cluster.map((c) => c.row),
        firstDay: cluster[0].day,
        lastDay: cluster[cluster.length - 1].day,
        tightestGapDays: tightest,
      });
    };

    for (let i = 1; i < list.length; i++) {
      if (dayGap(list[i - 1].day, list[i].day) < minGapDays) cluster.push(list[i]);
      else {
        flush();
        cluster = [list[i]];
      }
    }
    flush();
  }
  return conflicts;
}
