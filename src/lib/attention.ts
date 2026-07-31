import type { Deal } from "./types";
import type { ContentItem, OnboardingTask, PaymentItem, Shipment } from "./fulfillment-types";
import { BLOCKING_KINDS } from "./fulfillment-types";
import { isOverdue } from "./fulfillment-rules";
import { measurementState, type MeasurementWindows } from "./measurement";
import { dueReminders, reminderHref, type Reminder } from "./reminders";
import { DEFAULT_DRAFT_LEAD_DAYS, daysToPublish, shouldRequestDraft } from "./timeline";

export type AttentionSeverity = "critical" | "warning" | "info";

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  href: string;
  amount?: number;
}

export interface AttentionInput {
  deals: Deal[];
  contentItems: ContentItem[];
  shipments: Shipment[];
  payments: PaymentItem[];
  onboarding?: OnboardingTask[];
  /** The manager's own follow-ups — surfaced when their date arrives. */
  reminders?: Reminder[];
  /** Days before an item's publish date its draft is due. */
  draftLeadDays?: number;
  today?: string;
  /** Days of silence before we suggest nudging the creator. */
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
  reminders = [],
  draftLeadDays = DEFAULT_DRAFT_LEAD_DAYS,
  today = new Date().toISOString().slice(0, 10),
  silentDays = 3,
  stuckDays = 7,
  windows = {},
}: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
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
      href: `/deals/${c.deal_id}`,
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
      href: `/deals/${c.deal_id}`,
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
      href: `/deals/${p.deal_id}`,
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
        href: `/deals/${s.deal_id}`,
      });
    } else if (s.status === "shipped" && s.shipped_at) {
      const inTransit = daysBetween(s.shipped_at, today);
      if (inTransit >= stuckDays) {
        items.push({
          id: `shipment-stuck-${s.id}`,
          severity: "warning",
          title: `${nameOf(s.deal_id)} — shipment not confirmed`,
          detail: `${s.product} shipped ${inTransit} days ago and isn't marked delivered`,
          href: `/deals/${s.deal_id}`,
        });
      }
    }
  }

  // Negotiations where the ball is in their court and has been for a while.
  for (const d of deals) {
    if (d.stage !== "offer_sent" && d.stage !== "negotiating") continue;
    if (d.your_move === 1) continue;
    const quiet = daysBetween(d.updated_at, today);
    if (quiet >= silentDays) {
      items.push({
        id: `silent-${d.id}`,
        severity: "info",
        title: `${d.creator} — no reply in ${quiet} days`,
        detail: "Consider a follow-up nudge",
        href: `/deals/${d.id}`,
      });
    }
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
      title: `${d.creator} — verdict ready to review`,
      detail:
        waiting >= 1
          ? `Waiting ${waiting} day${waiting === 1 ? "" : "s"} — send an offer or decline`
          : "Send an offer or decline",
      href: `/deals/${d.id}`,
    });
  }

  // Your move in a live negotiation.
  for (const d of deals) {
    if (d.your_move !== 1) continue;
    items.push({
      id: `your-move-${d.id}`,
      severity: "warning",
      title: `${d.creator} — your move`,
      detail: `Round ${d.round}: the Copilot's recommendation is waiting`,
      href: `/deals/${d.id}`,
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
      href: `/deals/${c.deal_id}`,
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
      title: `${d.creator} — ${blocking.map((t) => t.label.toLowerCase()).join(" and ")} still missing`,
      detail: started
        ? "Content is already in production — without this the results can't be tracked"
        : "Set this up before the content goes live",
      href: `/deals/${d.id}`,
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

  const rank: Record<AttentionSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
