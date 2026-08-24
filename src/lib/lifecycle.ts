import type { ContentStatus, PaymentStatus, ShipmentStatus } from "./fulfillment-types";
import type { Stage } from "./types";

export interface LifecycleResult {
  ok: boolean;
  reason?: string;
}

type ContentState = { status: ContentStatus };
type PaymentState = { status: PaymentStatus };
type ShipmentState = { status: ShipmentStatus };

/** Fulfillment is real work, so it only starts after the deal has been won. */
export function canManageFulfillment(stage: Stage): LifecycleResult {
  return stage === "agreed"
    ? { ok: true }
    : {
        ok: false,
        reason:
          stage === "completed"
            ? "This deal is completed. Move it back to Agreed before changing fulfillment."
            : "Mark the deal Agreed before creating or advancing fulfillment work.",
      };
}

/**
 * A completed deal is an outcome, not a shortcut past unfinished delivery or money.
 * Empty categories are fine (not every deal ships product or pays cash), but at least
 * one tracked fulfillment record must exist so "Completed" means something auditable.
 */
export function canCompleteDeal(input: {
  currentStage: Stage;
  content: ContentState[];
  payments: PaymentState[];
  shipments: ShipmentState[];
}): LifecycleResult {
  if (input.currentStage !== "agreed") {
    return { ok: false, reason: "Move the deal to Agreed before completing it." };
  }

  const tracked = input.content.length + input.payments.length + input.shipments.length;
  if (tracked === 0) {
    return { ok: false, reason: "Track the deliverables, payment, or product before completing this deal." };
  }

  const openContent = input.content.filter((item) => item.status !== "verified").length;
  const openPayments = input.payments.filter((item) => item.status !== "paid").length;
  const openShipments = input.shipments.filter((item) => item.status !== "delivered").length;
  const open: string[] = [];
  if (openContent) open.push(`${openContent} content item${openContent === 1 ? "" : "s"} not verified`);
  if (openPayments) open.push(`${openPayments} payment${openPayments === 1 ? "" : "s"} not paid`);
  if (openShipments) open.push(`${openShipments} shipment${openShipments === 1 ? "" : "s"} not delivered`);

  return open.length > 0
    ? { ok: false, reason: `Finish the open work first: ${open.join(", ")}.` }
    : { ok: true };
}

/** Signed/active work cannot be silently turned back into a lead or a loss. */
export function canLeaveWonStage(input: {
  currentStage: Stage;
  nextStage: Stage;
  hasConfirmedContract: boolean;
  contentCount: number;
  paymentCount: number;
  shipmentCount: number;
}): LifecycleResult {
  if (input.currentStage !== "agreed") return { ok: true };
  if (input.nextStage === "agreed" || input.nextStage === "completed") return { ok: true };

  const hasWork =
    input.hasConfirmedContract ||
    input.contentCount > 0 ||
    input.paymentCount > 0 ||
    input.shipmentCount > 0;
  return hasWork
    ? {
        ok: false,
        reason:
          "This won deal already has contract or fulfillment records. Remove or resolve those records before moving it back into negotiation or declining it.",
      }
    : { ok: true };
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && value.length <= 500;
  } catch {
    return false;
  }
}

const NEXT_CONTENT_STATUS: Record<ContentStatus, ContentStatus | null> = {
  planned: "in_production",
  in_production: "submitted",
  submitted: "approved",
  approved: "posted",
  posted: "verified",
  verified: null,
};

/** Exact, forward-only content progression; specialist review actions enforce their steps. */
export function canAdvanceContent(current: ContentStatus, next: ContentStatus): LifecycleResult {
  if (NEXT_CONTENT_STATUS[current] !== next) {
    return { ok: false, reason: `Content cannot move directly from ${current} to ${next}.` };
  }
  if (next === "submitted") {
    return { ok: false, reason: "Submit a draft link to move this item into review." };
  }
  if (next === "approved") {
    return { ok: false, reason: "Use Approve draft so the approved version is recorded." };
  }
  return { ok: true };
}
