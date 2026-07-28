import type { PaymentStatus } from "./fulfillment-types";

/**
 * The payment state machine, enforced at the server boundary.
 *
 * Until this existed, the status column took whatever string an action sent it — a
 * stale tab could mark a `pending` payment `paid` with nothing verified, and because
 * the recompute engine refuses to downgrade settled money, the mistake was permanent.
 * The type system can't help: `PaymentStatus` is erased at runtime, and server actions
 * are network endpoints.
 *
 * `pending` and `approvable` are machine-managed — `refreshPaymentStatuses` derives
 * them from linked content — so no manual move lands ON pending, and the only manual
 * move on a pending row is nothing at all: it becomes approvable when the work does.
 * `paid` is terminal; correcting a genuinely wrong paid row is a deliberate act that
 * deserves more friction than a status button.
 */
const MANUAL_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  pending: [],
  approvable: ["approved"],
  approved: ["paid", "approvable"], // pay, or undo the approval
  paid: [],
};

const ALL_STATUSES: PaymentStatus[] = ["pending", "approvable", "approved", "paid"];

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (ALL_STATUSES as string[]).includes(value);
}

export function canTransition(
  from: PaymentStatus,
  to: PaymentStatus
): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: true };
  if (MANUAL_TRANSITIONS[from].includes(to)) return { ok: true };

  if (from === "paid") {
    return { ok: false, reason: "This payment is already paid — a settled payment can't be changed." };
  }
  if (from === "pending") {
    return {
      ok: false,
      reason:
        "This payment isn't ready yet — it becomes approvable when its linked content is verified.",
    };
  }
  if (to === "paid") {
    return { ok: false, reason: "A payment must be approved before it can be marked paid." };
  }
  return { ok: false, reason: `Can't move a payment from ${from} to ${to}.` };
}
