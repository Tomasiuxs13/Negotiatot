import type { Deal } from "./types";
import type {
  ContentItem,
  Contract,
  OnboardingTask,
  PaymentItem,
  Shipment,
  TaskOwner,
} from "./fulfillment-types";
import { BLOCKING_KINDS, blockingLabel } from "./fulfillment-types";
import { isOverdue } from "./fulfillment-rules";
import { measurementState, type MeasurementWindows } from "./measurement";
import { dueReminders, reminderHref, type Reminder } from "./reminders";
import { DEFAULT_DRAFT_LEAD_DAYS, daysToPublish, shouldRequestDraft } from "./timeline";
import type { FollowUpCandidate } from "./followups";

export type AttentionSeverity = "critical" | "warning" | "info";

/**
 * What kind of work this is. A flat list of twenty mixes "review this draft" with "chase
 * a reply" and "approve a payment" — all yours, but each needing a different head. The
 * groups exist so the day can be worked in batches rather than context-switched through.
 */
export type AttentionGroup = "content" | "negotiation" | "delivery" | "money" | "followups";

export const ATTENTION_GROUP_LABEL: Record<AttentionGroup, string> = {
  content: "Content",
  negotiation: "Negotiation",
  delivery: "Setup & delivery",
  money: "Money",
  followups: "Follow-ups",
};

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  href: string;
  amount?: number;
  group: AttentionGroup;
  /** Null when nobody can act — in transit, or simply information. */
  owner: TaskOwner | null;
}

/**
 * Item ids are already a stable taxonomy — every rule below namespaces its own — so the
 * classification is derived from them in one pass rather than repeated at twenty push
 * sites, where it would drift the first time a rule was added in a hurry.
 *
 * `owner` is the split that matters most: "chase them" and "do it yourself" look
 * identical in a list and are not remotely the same job.
 */
const CLASSIFY: [prefix: string, group: AttentionGroup, owner: TaskOwner | null][] = [
  ["reminder-", "followups", "us"],
  ["draft-request-", "content", "creator"],
  ["draft-review-", "content", "us"],
  ["date-change-", "content", "us"],
  ["content-overdue-", "content", "creator"],
  ["content-soon-", "content", "creator"],
  ["measure-", "content", "us"],
  ["payment-", "money", "us"],
  ["shipment-prepare-", "delivery", "us"],
  ["shipment-stuck-", "delivery", null],
  ["setup-gap-", "delivery", "us"],
  ["onboarding-", "delivery", "us"],
  ["follow-up-", "negotiation", "creator"],
  ["verdict-", "negotiation", "us"],
  ["your-move-", "negotiation", "us"],
  ["stale-lead-", "negotiation", "us"],
  ["revisit-", "followups", "us"],
  ["wrap-up-", "followups", "us"],
];

export function classifyAttention(id: string): {
  group: AttentionGroup;
  owner: TaskOwner | null;
} {
  const hit = CLASSIFY.find(([prefix]) => id.startsWith(prefix));
  // An unclassified id is a new rule nobody wired up; "follow-ups" keeps it visible
  // rather than dropping it, which is the failure that would go unnoticed.
  return hit ? { group: hit[1], owner: hit[2] } : { group: "followups", owner: "us" };
}

export interface AttentionBucket {
  key: AttentionGroup;
  label: string;
  items: AttentionItem[];
  /** How many of these are somebody else's move, so the group can say so up front. */
  waitingOnThem: number;
}

/** Fixed order, used only to break ties between groups of equal urgency. */
const GROUP_ORDER: AttentionGroup[] = ["content", "money", "delivery", "negotiation", "followups"];

const SEVERITY_RANK: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Buckets the worklist, ordered by whatever is most on fire rather than by a fixed menu:
 * grouping must not bury a critical item under a heading that always sits last.
 */
export function groupAttention(items: AttentionItem[]): AttentionBucket[] {
  const buckets = new Map<AttentionGroup, AttentionItem[]>();
  for (const item of items) {
    const list = buckets.get(item.group);
    if (list) list.push(item);
    else buckets.set(item.group, [item]);
  }

  return [...buckets.entries()]
    .map(([key, list]) => ({
      key,
      label: ATTENTION_GROUP_LABEL[key],
      items: [...list].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
      waitingOnThem: list.filter((i) => i.owner === "creator").length,
    }))
    .sort((a, b) => {
      const worst = (g: AttentionBucket) =>
        Math.min(...g.items.map((i) => SEVERITY_RANK[i.severity]));
      return (
        worst(a) - worst(b) || GROUP_ORDER.indexOf(a.key) - GROUP_ORDER.indexOf(b.key)
      );
    });
}

export interface AttentionInput {
  deals: Deal[];
  contentItems: ContentItem[];
  shipments: Shipment[];
  payments: PaymentItem[];
  onboarding?: OnboardingTask[];
  contracts?: Contract[];
  /** The manager's own follow-ups — surfaced when their date arrives. */
  reminders?: Reminder[];
  /** Stage-aware nudges based on the last outbound message, supplied by the data layer. */
  followUps?: FollowUpCandidate[];
  /** Days before an item's publish date its draft is due. */
  draftLeadDays?: number;
  today?: string;
  /** Days of silence before we flag other time-based negotiation work. */
  silentDays?: number;
  /** Days in transit before a shipment looks stuck. */
  stuckDays?: number;
  /** How long each platform's views need to settle before they're worth reading. */
  windows?: MeasurementWindows;
}

/**
 * Whole calendar days between two dates, ignoring time of day — "shipped 12 days ago"
 * should not become 11 because it went out at noon.
 */
function daysBetween(from: string, to: string): number {
  const a = new Date(from.slice(0, 10) + "T00:00:00Z").getTime();
  const b = new Date(to.slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

/**
 * The day's worklist, computed from data rather than maintained by hand. Ordered so
 * the most costly thing to ignore sits at the top.
 */
export function attentionItems({
  deals,
  contentItems,
  shipments,
  payments,
  onboarding = [],
  contracts = [],
  reminders = [],
  followUps = [],
  draftLeadDays = DEFAULT_DRAFT_LEAD_DAYS,
  today = new Date().toISOString().slice(0, 10),
  silentDays = 3,
  stuckDays = 7,
  windows = {},
}: AttentionInput): AttentionItem[] {
  // Built without the classification, which is applied in one pass at the end.
  const items: Omit<AttentionItem, "group" | "owner">[] = [];
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const nameOf = (dealId: number) => dealById.get(dealId)?.creator ?? "Unknown";

  // The manager's own promises come first in kind: everything else here is derived
  // from data and will resurface on its own, but a written-down "ask again in three
  // months" exists nowhere else — if this list drops it, it's gone.
  for (const r of dueReminders(reminders, today)) {
    const days = daysBetween(r.due_on, today);
    const who = r.deal_id != null ? nameOf(r.deal_id) : null;
    items.push({
      id: `reminder-${r.id}`,
      severity: days > 7 ? "critical" : "warning",
      title: `Reminder: ${r.title}`,
      detail:
        (who ? `${who} · ` : "") +
        (days === 0 ? "due today" : `due ${days} day${days === 1 ? "" : "s"} ago`),
      href: reminderHref(r),
    });
  }

  // The T-minus draft trigger: the publish slot only holds if the draft arrives with
  // review time to spare. Fires while there is still a buffer — the overdue loop below
  // only speaks up once the slot is already lost.
  for (const c of contentItems) {
    if (!shouldRequestDraft(c, today, draftLeadDays)) continue;
    const deal = dealById.get(c.deal_id);
    if (!deal || deal.stage !== "agreed") continue;
    const days = daysToPublish(c.due_date!, today);
    if (days < 0) continue; // past publish — the overdue loop owns it from here
    items.push({
      id: `draft-request-${c.id}`,
      severity: days <= 5 ? "critical" : "warning",
      title: `Request the draft from ${deal.creator}`,
      detail: `${c.title} publishes ${days === 0 ? "today" : `in ${days} day${days === 1 ? "" : "s"}`} — the draft review window is open`,
      href: `/deals/${c.deal_id}?tab=fulfillment`,
    });
  }

  // A submitted draft waiting on you: the review clock (48h by convention, and the
  // publish slot in fact) starts at submission, not when you happen to open the deal.
  for (const c of contentItems) {
    if (c.status !== "submitted") continue;
    const deal = dealById.get(c.deal_id);
    if (!deal || (deal.stage !== "agreed" && deal.stage !== "completed")) continue;
    const days = c.due_date ? daysToPublish(c.due_date, today) : null;
    items.push({
      id: `draft-review-${c.id}`,
      severity: days != null && days <= 5 ? "critical" : "warning",
      title: `Review the draft from ${deal.creator}`,
      detail:
        `${c.title}${(c.revision_round ?? 0) > 1 ? ` · revision ${c.revision_round}` : ""}` +
        (days != null ? ` — publishes ${days === 0 ? "today" : days < 0 ? "overdue" : `in ${days} day${days === 1 ? "" : "s"}`}` : ""),
      href: `/deals/${c.deal_id}?tab=fulfillment`,
    });
  }

  // A creator's proposed date is not yet the real deadline. It remains here until the
  // manager explicitly approves it or keeps the current date.
  for (const c of contentItems) {
    if (!c.requested_due_date) continue;
    const deal = dealById.get(c.deal_id);
    if (!deal || deal.stage !== "agreed") continue;
    items.push({
      id: `date-change-${c.id}`,
      severity: "warning",
      title: `Review ${deal.creator}'s date request`,
      detail: `${c.title}: ${c.due_date ?? "no current date"} → ${c.requested_due_date}`,
      href: `/deals/${c.deal_id}?tab=fulfillment`,
    });
  }

  // Content past its deadline — the most expensive thing to miss.
  for (const c of contentItems) {
    if (!isOverdue(c, today)) continue;
    const late = c.due_date ? daysBetween(c.due_date, today) : 0;
    const who = nameOf(c.deal_id);
    items.push({
      id: `content-overdue-${c.id}`,
      severity: "critical",
      title: `${who} — content overdue`,
      detail: `${c.title} was due ${late} day${late === 1 ? "" : "s"} ago — check in with ${who}`,
      href: `/deals/${c.deal_id}?tab=fulfillment`,
    });
  }

  // Money the partner has earned and is waiting on.
  for (const p of payments) {
    if (p.status !== "approvable") continue;
    items.push({
      id: `payment-${p.id}`,
      severity: "warning",
      title: `${nameOf(p.deal_id)} — payment ready to approve`,
      detail: p.description,
      href: `/deals/${p.deal_id}?tab=fulfillment`,
      amount: p.amount,
    });
  }

  // Product that hasn't gone out, or has been in transit too long.
  for (const s of shipments) {
    if (s.status === "to_prepare") {
      items.push({
        id: `shipment-prepare-${s.id}`,
        severity: "warning",
        title: `${nameOf(s.deal_id)} — product not sent`,
        detail: `${s.product} still needs shipping`,
        href: `/deals/${s.deal_id}?tab=fulfillment`,
      });
    } else if (s.status === "shipped" && s.shipped_at) {
      const inTransit = daysBetween(s.shipped_at, today);
      if (inTransit >= stuckDays) {
        items.push({
          id: `shipment-stuck-${s.id}`,
          severity: "warning",
          title: `${nameOf(s.deal_id)} — shipment not confirmed`,
          detail: `${s.product} shipped ${inTransit} days ago and isn't marked delivered`,
          href: `/deals/${s.deal_id}?tab=fulfillment`,
        });
      }
    }
  }

  // A follow-up is driven by the last outbound message, not deal.updated_at: editing a
  // note should never buy someone another three days of silence. The draft itself is
  // shown after this link, in the negotiation workspace where it can be edited first.
  for (const followUp of followUps) {
    items.push({
      id: `follow-up-${followUp.dealId}`,
      severity: followUp.daysWaiting >= 7 ? "warning" : "info",
      title: `${followUp.creator} — follow-up ready`,
      detail: `No reply for ${followUp.daysWaiting} day${followUp.daysWaiting === 1 ? "" : "s"} · ${followUp.stage === "offer_sent" ? "offer follow-up" : "negotiation follow-up"} drafted`,
      href: `/deals/${followUp.dealId}?tab=negotiation`,
    });
  }

  // Analysis finished and nobody has acted on the verdict. Once the Copilot has drafted
  // a move, "your move" below says the same thing with a next step attached — showing
  // both makes one job look like two.
  for (const d of deals) {
    if (d.stage !== "analyzing" || d.job_status != null || d.analysis == null) continue;
    if (d.your_move === 1) continue;
    const waiting = daysBetween(d.updated_at, today);
    items.push({
      id: `verdict-${d.id}`,
      severity: waiting >= silentDays ? "warning" : "info",
      title: `${d.creator} — verdict ready`,
      detail:
        waiting >= 1
          ? `Waiting ${waiting}d — send an offer or decline`
          : "Send an offer or decline",
      href: `/deals/${d.id}?tab=analysis`,
    });
  }

  // Your move in a live negotiation.
  for (const d of deals) {
    if (d.your_move !== 1) continue;
    items.push({
      id: `your-move-${d.id}`,
      severity: "warning",
      title: `${d.creator} — your move`,
      detail: `Round ${d.round} · recommendation ready to send`,
      href: `/deals/${d.id}?tab=negotiation`,
    });
  }

  // Leads that have gone cold before anyone reached out.
  for (const d of deals) {
    if (d.stage !== "lead") continue;
    const age = daysBetween(d.updated_at, today);
    if (age >= 7) {
      items.push({
        id: `stale-lead-${d.id}`,
        severity: "info",
        title: `${d.creator} — lead untouched for ${age} days`,
        detail: "Reach out or drop it",
        href: `/deals/${d.id}`,
      });
    }
  }

  // Content due soon, so nothing sneaks up.
  for (const c of contentItems) {
    if (!c.due_date || isOverdue(c, today)) continue;
    if (c.status === "posted" || c.status === "verified") continue;
    const days = daysBetween(today, c.due_date);
    if (days >= 0 && days <= 7) {
      items.push({
        id: `content-soon-${c.id}`,
        severity: "info",
        title: `${nameOf(c.deal_id)} — content due in ${days} day${days === 1 ? "" : "s"}`,
        detail: c.title,
        href: `/deals/${c.deal_id}`,
      });
    }
  }

  // Content that has had time to settle and still has no final reading. Nobody
  // remembers that a video posted five weeks ago is now worth measuring.
  for (const c of contentItems) {
    const deal = dealById.get(c.deal_id);
    if (!deal || (deal.stage !== "agreed" && deal.stage !== "completed")) continue;
    const m = measurementState(c, windows, today);
    if (m.state !== "due" && m.state !== "provisional") continue;
    if (m.state === "provisional" && (m.daysUntilMature ?? 0) > 0) continue;
    items.push({
      id: `measure-${c.id}`,
      severity: "info",
      title: `${nameOf(c.deal_id)} — ready to measure`,
      detail:
        m.state === "provisional"
          ? `${c.title} has settled — replace the provisional number with final results`
          : `${c.title} passed its ${m.windowDays}-day window — log final results`,
      href: `/deals/${c.deal_id}?tab=actuals`,
    });
  }

  // Setup that other work is already outrunning. A creator filming against a link that
  // doesn't exist yet is the failure this checklist exists to prevent.
  for (const d of deals) {
    if (d.stage !== "agreed") continue;
    const blocking = onboarding.filter(
      (t) =>
        t.status !== "done" &&
        BLOCKING_KINDS.includes(t.kind) &&
        (t.deal_id === d.id || (t.deal_id == null && t.partner_id === d.partner_id))
    );
    if (blocking.length === 0) continue;

    const started = contentItems.some(
      (c) => c.deal_id === d.id && c.status !== "planned"
    );
    items.push({
      id: `onboarding-${d.id}`,
      severity: started ? "warning" : "info",
      title: `${d.creator} — no ${blockingLabel(blocking.map((t) => t.kind))}`,
      detail: started
        ? "Content is already in production — without this the results can't be tracked"
        : "Set this up before the content goes live",
      href: `/deals/${d.id}`,
    });
  }

  // One exception per agreement, rather than three separate warnings. The manager can
  // open Fulfillment once and finish the entire hand-off from negotiation to delivery.
  for (const d of deals) {
    if (d.stage !== "agreed") continue;
    const missing: string[] = [];
    if (!contracts.some((contract) => contract.deal_id === d.id && contract.status === "confirmed")) {
      missing.push("confirmed signed contract");
    }
    if (!contentItems.some((content) => content.deal_id === d.id)) {
      missing.push("content plan");
    }
    if (
      (d.agreed_price ?? d.current_offer ?? 0) > 0 &&
      !payments.some((payment) => payment.deal_id === d.id)
    ) {
      missing.push("payment schedule");
    }
    if (missing.length === 0) continue;
    items.push({
      id: `setup-gap-${d.id}`,
      severity: "warning",
      title: `${d.creator} — agreement setup incomplete`,
      detail: `Missing ${missing.join(", ")}`,
      href: `/deals/${d.id}?tab=fulfillment`,
    });
  }

  // Deals parked on timing whose date has come round. Without this, "revisit in Q4"
  // is a note nobody reads again.
  for (const d of deals) {
    if (d.stage !== "declined" || !d.revisit_on) continue;
    if (d.revisit_on > today) continue;
    items.push({
      id: `revisit-${d.id}`,
      severity: "info",
      title: `${d.creator} — worth revisiting`,
      detail: d.decline_note
        ? `Parked on timing: ${d.decline_note}`
        : "You parked this one on timing — the date you set has arrived",
      href: `/deals/${d.id}`,
    });
  }

  // Deals where the work and the money are both done — close them out so the board
  // reflects live work rather than history.
  for (const d of deals) {
    if (d.stage !== "agreed") continue;
    const content = contentItems.filter((c) => c.deal_id === d.id);
    const dealPayments = payments.filter((p) => p.deal_id === d.id);
    const contentDone = content.length > 0 && content.every((c) => c.status === "verified");
    const paid = dealPayments.length > 0 && dealPayments.every((p) => p.status === "paid");
    if (contentDone && paid) {
      items.push({
        id: `wrap-up-${d.id}`,
        severity: "info",
        title: `${d.creator} — ready to wrap up`,
        detail: "All content verified and paid — mark the deal completed",
        href: `/deals/${d.id}`,
      });
    }
  }

  return items
    .map((i) => ({ ...i, ...classifyAttention(i.id) }))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}
