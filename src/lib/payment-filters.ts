import type { PaymentItem, PaymentStatus } from "./fulfillment-types";

export type PaymentRow = PaymentItem & { creator: string };

export interface PaymentFilters {
  status?: string;
  creator?: string;
  /** Only payments settled or due on/after this date. */
  from?: string;
  to?: string;
}

/**
 * The date a payment belongs to for reporting: when it was paid, else approved, else
 * when it falls due. Accounting cares when money moved, not when the row was created.
 */
export function paymentDate(p: PaymentRow): string | null {
  return p.paid_at?.slice(0, 10) ?? p.approved_at?.slice(0, 10) ?? p.due_date ?? null;
}

/** Applies the page's filters. Shared so the CSV can never disagree with the screen. */
export function filterPayments(rows: PaymentRow[], f: PaymentFilters): PaymentRow[] {
  return rows.filter((p) => {
    if (f.status && p.status !== (f.status as PaymentStatus)) return false;
    if (f.creator && p.creator !== f.creator) return false;
    if (f.from || f.to) {
      const date = paymentDate(p);
      // A payment with no date yet can't be in a date window.
      if (!date) return false;
      if (f.from && date < f.from) return false;
      if (f.to && date > f.to) return false;
    }
    return true;
  });
}

export function paymentTotals(rows: PaymentRow[]) {
  const sum = (status: PaymentStatus) =>
    rows.filter((p) => p.status === status).reduce((s, p) => s + p.amount, 0);
  return {
    approvable: sum("approvable"),
    approved: sum("approved"),
    pending: sum("pending"),
    paid: sum("paid"),
    total: rows.reduce((s, p) => s + p.amount, 0),
  };
}
