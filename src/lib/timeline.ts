import { addDays } from "./fulfillment-rules";
import type { ContentItem } from "./fulfillment-types";

/**
 * The publish date drives everything backwards: the draft must arrive early enough to
 * review, request changes, and re-review before the slot. A content item's `due_date`
 * IS its agreed publish date; the draft deadline is computed from it rather than
 * stored, so changing the publish date can never leave a stale draft date behind.
 */

/** How many days before publish the draft is due, unless the manager set otherwise. */
export const DEFAULT_DRAFT_LEAD_DAYS = 10;

export function draftDueDate(publishDate: string, leadDays = DEFAULT_DRAFT_LEAD_DAYS): string {
  return addDays(publishDate, -Math.abs(leadDays));
}

/** Statuses where no draft has reached us yet — the creator still owes one. */
const AWAITING_DRAFT: ContentItem["status"][] = ["planned", "in_production"];

/**
 * True when it's time to chase the draft: the item has a publish date, no draft has
 * been submitted, and the draft deadline has arrived. This is the T-minus trigger the
 * whole review loop hangs on — miss it and the review buffer is quietly gone.
 */
export function shouldRequestDraft(
  item: Pick<ContentItem, "status" | "due_date">,
  today: string,
  leadDays = DEFAULT_DRAFT_LEAD_DAYS
): boolean {
  if (!item.due_date) return false;
  if (!AWAITING_DRAFT.includes(item.status)) return false;
  return draftDueDate(item.due_date, leadDays) <= today;
}

/** Days from today until the publish slot — negative when it has already passed. */
export function daysToPublish(publishDate: string, today: string): number {
  const a = new Date(today.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(publishDate.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86_400_000);
}
