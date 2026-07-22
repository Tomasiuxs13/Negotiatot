import type { ContentItem, OnboardingTask, PaymentItem, Shipment } from "./fulfillment-types";
import { BLOCKING_KINDS } from "./fulfillment-types";

export type PhaseKey =
  | "setup"
  | "shipping"
  | "producing"
  | "posted"
  | "awaiting_payment"
  | "ready_to_wrap"
  | "nothing_tracked";

export interface DealPhase {
  key: PhaseKey;
  /** Short enough for a kanban card. */
  label: string;
  /** Something earlier in the sequence is still open — the "ahead here, behind there" case. */
  behind: string | null;
  tone: "neutral" | "good" | "warn";
}

export interface PhaseInput {
  dealId: number;
  partnerId: number | null;
  onboarding: OnboardingTask[];
  shipments: Shipment[];
  contentItems: ContentItem[];
  payments: PaymentItem[];
}

/** Onboarding rows that apply to this deal — its own, plus the partner's shared setup. */
function onboardingFor(input: PhaseInput): OnboardingTask[] {
  return input.onboarding.filter(
    (t) =>
      t.deal_id === input.dealId ||
      (t.deal_id == null && input.partnerId != null && t.partner_id === input.partnerId)
  );
}

/**
 * Where a signed deal actually stands.
 *
 * Deliberately not a pipeline stage: a deal is routinely mid-onboarding *and*
 * mid-production *and* awaiting payment at the same time, so any single column would
 * have to hide two of the three. The phase reports how far the work has got, and
 * `behind` names what was skipped over — which is the part a column can't express.
 */
export function dealPhase(input: PhaseInput): DealPhase {
  const tasks = onboardingFor(input);
  const content = input.contentItems.filter((c) => c.deal_id === input.dealId);
  const payments = input.payments.filter((p) => p.deal_id === input.dealId);
  const shipments = input.shipments.filter((s) => s.deal_id === input.dealId);

  const setupLeft = tasks.filter((t) => t.status !== "done");
  const blockingLeft = setupLeft.filter((t) => BLOCKING_KINDS.includes(t.kind));
  const undelivered = shipments.filter((s) => s.status !== "delivered");

  const started = content.filter((c) => c.status !== "planned").length;
  const verified = content.filter((c) => c.status === "verified").length;
  const unpaid = payments.filter((p) => p.status !== "paid");
  const approvable = payments.filter((p) => p.status === "approvable");

  // What the furthest-along work has outrun. Blocking setup is worth naming even when
  // production is underway; a pending shipment matters only before filming starts.
  const behind =
    blockingLeft.length > 0
      ? `${blockingLeft.length} setup step${blockingLeft.length === 1 ? "" : "s"} missing`
      : null;

  if (content.length === 0 && payments.length === 0 && tasks.length === 0) {
    return { key: "nothing_tracked", label: "Nothing tracked yet", behind: null, tone: "neutral" };
  }

  // Everything delivered and paid — the deal is done but still sitting on the board.
  if (content.length > 0 && verified === content.length && unpaid.length === 0) {
    return { key: "ready_to_wrap", label: "Ready to wrap", behind, tone: "good" };
  }

  // Work finished, money outstanding.
  if (content.length > 0 && verified === content.length) {
    return {
      key: "awaiting_payment",
      label: approvable.length > 0 ? "Payment to approve" : "Awaiting payment",
      behind,
      tone: approvable.length > 0 ? "warn" : "neutral",
    };
  }

  if (started > 0) {
    // The count has to mean what the word says: "Posted 1/3" is one piece live, not one
    // piece verified. Verification is chased separately, by the Attention panel.
    const live = content.filter((c) => c.status === "posted" || c.status === "verified").length;
    return {
      key: live > 0 ? "posted" : "producing",
      label: `${live > 0 ? "Posted" : "Producing"} ${live}/${content.length}`,
      behind,
      tone: behind ? "warn" : "neutral",
    };
  }

  // Nothing filmed yet — the blockers are what matter.
  if (undelivered.length > 0) {
    const s = undelivered[0];
    return {
      key: "shipping",
      label: s.status === "to_prepare" ? "Product to send" : "Product in transit",
      behind,
      tone: s.status === "to_prepare" ? "warn" : "neutral",
    };
  }

  if (setupLeft.length > 0) {
    return {
      key: "setup",
      label: `Onboarding · ${setupLeft.length} left`,
      behind: null,
      tone: blockingLeft.length > 0 ? "warn" : "neutral",
    };
  }

  return { key: "producing", label: `Producing 0/${content.length}`, behind, tone: "neutral" };
}
