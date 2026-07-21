import type { Deal } from "./types";
import type { ContentItem, PaymentItem, Shipment } from "./fulfillment-types";
import { isOverdue } from "./fulfillment-rules";

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
  today?: string;
  /** Days of silence before we suggest nudging the creator. */
  silentDays?: number;
  /** Days in transit before a shipment looks stuck. */
  stuckDays?: number;
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
  today = new Date().toISOString().slice(0, 10),
  silentDays = 3,
  stuckDays = 7,
}: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const nameOf = (dealId: number) => dealById.get(dealId)?.creator ?? "Unknown";

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

  // Analysis finished and nobody has acted on the verdict.
  for (const d of deals) {
    if (d.stage !== "analyzing" || d.job_status != null || d.analysis == null) continue;
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
