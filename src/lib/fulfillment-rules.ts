import type { ContentItem, PaymentItem, PaymentStatus } from "./fulfillment-types";

/** Adds days to a date, returning YYYY-MM-DD. */
export function addDays(from: string | Date, days: number): string {
  const base = typeof from === "string" ? new Date(from.replace(" ", "T") + "Z") : from;
  const result = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return result.toISOString().slice(0, 10);
}

export function parseLinkedIds(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(Number).filter((n) => !Number.isNaN(n)) : [];
  } catch {
    return [];
  }
}

/**
 * Should a payment item be approvable yet? Payment follows proof:
 * - on_signing: nothing to wait for
 * - on_delivery: the product must have reached the partner
 * - on_verification: every linked content item must be verified (all of the deal's
 *   content, when nothing specific was linked)
 * - date: the due date must have arrived
 * Already-approved/paid items are never downgraded.
 */
export function paymentApprovable(
  payment: Pick<
    PaymentItem,
    "trigger" | "status" | "due_date" | "linked_content_ids" | "required_verified"
  >,
  contentItems: Pick<ContentItem, "id" | "status">[],
  productDelivered: boolean,
  today = new Date().toISOString().slice(0, 10)
): boolean {
  if (payment.status === "approved" || payment.status === "paid") return true;

  switch (payment.trigger) {
    case "on_signing":
      return true;
    case "on_delivery":
      return productDelivered;
    case "date":
      return payment.due_date != null && payment.due_date <= today;
    case "on_verification": {
      const linked = parseLinkedIds(payment.linked_content_ids);
      const relevant =
        linked.length > 0 ? contentItems.filter((c) => linked.includes(c.id)) : contentItems;
      if (relevant.length === 0) return false;
      // Milestone gates: "50% after half the videos" needs only N of the linked items
      // verified, not all of them. Null keeps the strict all-verified default, and the
      // requirement is capped at what's actually linked so an over-large N can't make
      // a payment permanently unreachable.
      const required = Math.min(payment.required_verified ?? relevant.length, relevant.length);
      const verified = relevant.filter((c) => c.status === "verified").length;
      return verified >= Math.max(1, required);
    }
    default:
      return false;
  }
}

/** The status a payment item should have right now, given the deal's state. */
export function nextPaymentStatus(
  payment: Pick<
    PaymentItem,
    "trigger" | "status" | "due_date" | "linked_content_ids" | "required_verified"
  >,
  contentItems: Pick<ContentItem, "id" | "status">[],
  productDelivered: boolean,
  today?: string
): PaymentStatus {
  if (payment.status === "approved" || payment.status === "paid") return payment.status;
  return paymentApprovable(payment, contentItems, productDelivered, today) ? "approvable" : "pending";
}

/** Content that is late: due in the past and not yet posted or verified. */
export function isOverdue(
  item: Pick<ContentItem, "due_date" | "status">,
  today = new Date().toISOString().slice(0, 10)
): boolean {
  if (!item.due_date) return false;
  if (item.status === "posted" || item.status === "verified") return false;
  return item.due_date < today;
}

/** How a deal is really doing, derived from its items rather than a manual status. */
export function fulfillmentSummary(
  contentItems: Pick<ContentItem, "due_date" | "status">[],
  paymentItems: Pick<PaymentItem, "status" | "amount">[],
  today?: string
) {
  const verified = contentItems.filter((c) => c.status === "verified").length;
  const overdue = contentItems.filter((c) => isOverdue(c, today)).length;
  const awaitingApproval = paymentItems.filter((p) => p.status === "approvable").length;
  const unpaid = paymentItems
    .filter((p) => p.status !== "paid")
    .reduce((s, p) => s + p.amount, 0);

  return {
    totalContent: contentItems.length,
    verified,
    overdue,
    complete: contentItems.length > 0 && verified === contentItems.length,
    awaitingApproval,
    unpaid,
  };
}
