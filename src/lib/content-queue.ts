/**
 * The content worklist: what each deliverable is waiting on, whose move it is, and how
 * pressing it has become.
 *
 * Pure by design — no database import — so the board, the table and the tests all share
 * one definition of "what happens next". A status on its own doesn't say who has to act,
 * and that distinction is the point of the view: "waiting on them" and "waiting on me"
 * are different kinds of stuck, and only one of them is your problem to solve today.
 */

import type { ContentItem, ContentStatus, TaskOwner } from "./fulfillment-types";
import { isOverdue } from "./fulfillment-rules";
import {
  DEFAULT_DRAFT_LEAD_DAYS,
  daysToPublish,
  draftDueDate,
  shouldRequestDraft,
} from "./timeline";

/** A content item carrying enough deal context to be readable away from its deal page. */
export interface ContentRow {
  item: ContentItem;
  dealId: number;
  creator: string;
  campaign: string | null;
  /** What to display: the item's own platform, or the deal's when it is unambiguous. */
  platform: string | null;
}

/**
 * The single thing that would move this item forward. One per item, deliberately — a
 * card offering three buttons is a status display; a card offering one is a worklist.
 */
export type ActionKind =
  | "set_date"
  | "chase_draft"
  | "await_draft"
  | "review"
  | "await_post"
  | "check"
  | "measure"
  | "done";

export interface NextAction {
  kind: ActionKind;
  label: string;
  /** Null when nothing is outstanding — nobody is waiting on anybody. */
  owner: TaskOwner | null;
}

/**
 * A deliverable with no publish date can't be chased, can't be scheduled, and can't go
 * overdue — it simply falls out of every deadline the system computes. That silence is
 * why undated items are called out as the first thing to fix rather than sorted last.
 */
export function nextAction(
  row: ContentRow,
  today = new Date().toISOString().slice(0, 10),
  leadDays = DEFAULT_DRAFT_LEAD_DAYS
): NextAction {
  const item = row.item;

  switch (item.status) {
    case "planned":
    case "in_production": {
      // due_days_after_delivery is a real date in waiting — it resolves itself when the
      // product lands, so it is not a gap the manager has to close by hand.
      if (!item.due_date && item.due_days_after_delivery == null) {
        return { kind: "set_date", label: "Set publish date", owner: "us" };
      }
      if (shouldRequestDraft(item, today, leadDays)) {
        return { kind: "chase_draft", label: "Draft is due — chase it", owner: "creator" };
      }
      return { kind: "await_draft", label: "Waiting on the draft", owner: "creator" };
    }
    case "submitted":
      return { kind: "review", label: "Review the draft", owner: "us" };
    case "approved":
      return { kind: "await_post", label: "Waiting for it to go live", owner: "creator" };
    case "posted":
      // The check reads the posted video against the brief; until it has run, "posted"
      // means delivered but unverified, which is not the same as done.
      return item.check_result
        ? { kind: "measure", label: "Log the results", owner: "us" }
        : { kind: "check", label: "Run integration check", owner: "us" };
    case "verified":
      return item.actual_views == null
        ? { kind: "measure", label: "Log the results", owner: "us" }
        : { kind: "done", label: "Complete", owner: null };
  }
}

/**
 * Sort key within a column: days until the publish slot, so anything already past it
 * sorts negative and rises to the top on its own. One scale for every status — the
 * publish date is the clock the whole schedule hangs off, whatever stage an item is at.
 *
 * Undated items sort last. They are surfaced by the attention flag instead, which is the
 * honest treatment: they aren't urgent, they're unmeasurable.
 */
export function urgencyScore(
  row: ContentRow,
  today = new Date().toISOString().slice(0, 10)
): number {
  return row.item.due_date ? daysToPublish(row.item.due_date, today) : Number.MAX_SAFE_INTEGER;
}

/**
 * How long this item has sat where it is. Each status has its own stamp — using
 * updated_at alone would reset the clock every time a note was edited, hiding exactly
 * the draft that has been waiting a fortnight for review.
 */
export function daysInStatus(
  item: ContentItem,
  today = new Date().toISOString().slice(0, 10)
): number | null {
  const since =
    item.status === "submitted"
      ? item.draft_submitted_at
      : item.status === "approved"
        ? item.approved_at
        : item.status === "posted" || item.status === "verified"
          ? item.posted_at
          : item.updated_at;
  if (!since) return null;
  const a = new Date(since.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(today.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** Days a draft may sit unreviewed before the delay is ours rather than theirs. */
export const REVIEW_SLA_DAYS = 2;

/**
 * Whether this item should be pulled out of the flow of work. Three separate failures,
 * because they are fixed in three different ways: a date nobody set, a deadline nobody
 * met, and a review nobody did.
 */
export function needsAttention(
  row: ContentRow,
  today = new Date().toISOString().slice(0, 10),
  leadDays = DEFAULT_DRAFT_LEAD_DAYS
): boolean {
  const item = row.item;
  if (isOverdue(item, today)) return true;
  if (shouldRequestDraft(item, today, leadDays)) return true;
  if (item.status === "submitted") {
    const waiting = daysInStatus(item, today);
    if (waiting != null && waiting >= REVIEW_SLA_DAYS) return true;
  }
  return nextAction(row, today, leadDays).kind === "set_date";
}

/**
 * The platform to show. An item inherits the deal's platform only when the deal has
 * exactly one — on a cross-platform bundle a guess would be wrong about as often as it
 * was right, and a wrong platform is worse than a visible blank, because it filters.
 */
export function resolvePlatform(
  item: Pick<ContentItem, "platform">,
  dealPlatforms: string[]
): string | null {
  if (item.platform) return item.platform;
  return dealPlatforms.length === 1 ? dealPlatforms[0] : null;
}

/** Rows bucketed by status and ordered by urgency, ready to render as columns. */
export function groupByStatus(
  rows: ContentRow[],
  today = new Date().toISOString().slice(0, 10)
): Record<ContentStatus, ContentRow[]> {
  const groups = {
    planned: [],
    in_production: [],
    submitted: [],
    approved: [],
    posted: [],
    verified: [],
  } as Record<ContentStatus, ContentRow[]>;

  for (const row of rows) groups[row.item.status].push(row);
  for (const key of Object.keys(groups) as ContentStatus[]) {
    groups[key].sort((a, b) => urgencyScore(a, today) - urgencyScore(b, today));
  }
  return groups;
}

/**
 * The date the card leads with. Before a draft exists the deadline that actually binds
 * is the draft deadline, not the publish slot — showing the publish date there is how a
 * review buffer gets quietly spent.
 */
export function leadDate(
  item: ContentItem,
  leadDays = DEFAULT_DRAFT_LEAD_DAYS
): { label: string; date: string } | null {
  if (item.due_date) {
    if (item.status === "planned" || item.status === "in_production") {
      return { label: "draft due", date: draftDueDate(item.due_date, leadDays) };
    }
    return { label: "publishes", date: item.due_date };
  }
  if (item.due_days_after_delivery != null) {
    return { label: "due", date: `+${item.due_days_after_delivery}d after delivery` };
  }
  return null;
}
