/**
 * The content worklist: what each deliverable is waiting on, whose move it is, and how
 * pressing it has become.
 *
 * Pure by design — no database import — so the board, the table and the tests all share
 * one definition of "what happens next". A status on its own doesn't say who has to act,
 * and that distinction is the point of the view: "waiting on them" and "waiting on me"
 * are different kinds of stuck, and only one of them is your problem to solve today.
 */

import type {
  ContentItem,
  ContentStatus,
  OnboardingKind,
  OnboardingTask,
  Shipment,
  TaskOwner,
} from "./fulfillment-types";
import { BLOCKING_KINDS, blockingLabel } from "./fulfillment-types";
import { isOverdue } from "./fulfillment-rules";
import { parseCheck } from "./brief-requirements";
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
  /**
   * Unfinished setup this item's tracking depends on — the affiliate link and the coupon
   * code. A video can go live perfectly and still return nothing measurable if these are
   * missing, which is the one failure you cannot fix after the fact.
   */
  blockedBy: OnboardingKind[];
  /**
   * Product that has to reach the creator before they can film. Null once it has landed,
   * or when the deal sends nothing.
   */
  awaitingProduct: AwaitedProduct | null;
  /** Whether the linked campaign brief requires a transcript check before verification. */
  requiresCheck?: boolean;
}

export interface AwaitedProduct {
  product: string;
  status: "to_prepare" | "shipped";
}

/**
 * The setup standing between this deal and a measurable result.
 *
 * Returns kinds rather than labels: the stored labels are full sentences ("Affiliate
 * tracking link issued"), and two of them concatenated will not fit on a card. The
 * caller renders whichever length its space allows.
 *
 * Scope matters: registration and the affiliate link are issued once per creator, so a
 * task with no deal_id belongs to every deal that partner has. A coupon code is
 * campaign-specific and hangs off the deal. Matching only on deal_id would miss the
 * partner-wide link entirely — which is the one that most often isn't there.
 */
export function blockingSetup(
  tasks: Pick<OnboardingTask, "status" | "kind" | "deal_id" | "partner_id">[],
  dealId: number,
  partnerId: number | null
): OnboardingKind[] {
  return tasks
    .filter(
      (t) =>
        t.status !== "done" &&
        BLOCKING_KINDS.includes(t.kind) &&
        (t.deal_id === dealId || (t.deal_id == null && t.partner_id === partnerId))
    )
    .map((t) => t.kind);
}

/**
 * The undelivered product for a deal, if it has one.
 *
 * A creator cannot film what has not arrived, so this is the difference between "they
 * are late" and "we are". Delivered shipments return null — the dependency is over.
 */
export function awaitingShipment(
  shipments: Pick<Shipment, "deal_id" | "product" | "status">[],
  dealId: number
): AwaitedProduct | null {
  // Not-yet-prepared outranks in-transit: it is the one still sitting with us.
  const forDeal = shipments.filter((s) => s.deal_id === dealId && s.status !== "delivered");
  const pending =
    forDeal.find((s) => s.status === "to_prepare") ?? forDeal[0];
  if (!pending) return null;
  return { product: pending.product, status: pending.status as AwaitedProduct["status"] };
}

/** Statuses where the shoot is under way, so missing tracking is now urgent. */
function workStarted(status: ContentStatus): boolean {
  return status !== "planned";
}

/**
 * The single thing that would move this item forward. One per item, deliberately — a
 * card offering three buttons is a status display; a card offering one is a worklist.
 */
export type ActionKind =
  | "await_product"
  | "blocked"
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

  // The product outranks everything: there is no video to chase, date or track until it
  // arrives. Only on a planned item — anything further along means filming has begun, so
  // whatever the creator needed, they evidently have.
  if (item.status === "planned" && row.awaitingProduct) {
    return row.awaitingProduct.status === "to_prepare"
      ? { kind: "await_product", label: "Product not sent yet", owner: "us" }
      : // In transit is nobody's move — flagging it as yours would pad the count with
        // work you cannot actually do. The dashboard chases it if it goes stale.
        { kind: "await_product", label: "Product in transit", owner: null };
  }

  // Tracking that doesn't exist outranks everything else still to do, but only once
  // filming has started — chasing a link for a video nobody has begun is noise, and on a
  // posted item it is too late to be an action, so it stays a flag rather than a task.
  if (
    row.blockedBy.length > 0 &&
    workStarted(item.status) &&
    item.status !== "posted" &&
    item.status !== "verified"
  ) {
    return {
      kind: "blocked",
      label: `Blocked: ${blockingLabel(row.blockedBy)}`,
      owner: "us",
    };
  }

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
      if (row.requiresCheck === false) {
        return { kind: "measure", label: "Log the results", owner: "us" };
      }
      const check = parseCheck(item.check_result);
      return check && check.findings.every((finding) => finding.status === "met")
        ? { kind: "measure", label: "Log the results", owner: "us" }
        : {
            kind: "check",
            label: check ? "Resolve integration check" : "Run integration check",
            owner: "us",
          };
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
  // An unsent parcel is ours and nothing moves until it goes; one in transit is not
  // something you can act on, so it does not belong in a list of things to do.
  if (item.status === "planned" && row.awaitingProduct?.status === "to_prepare") return true;
  if (row.blockedBy.length > 0 && workStarted(item.status)) return true;
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
