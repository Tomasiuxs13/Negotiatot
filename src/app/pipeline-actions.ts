"use server";

import { revalidatePath } from "next/cache";
import { getDeal, updateDeal } from "@/lib/db";
import type { Stage } from "@/lib/types";
import { ALL_STAGES, DECLINE_REASONS, DECLINE_REASON_LABEL, type DeclineReason } from "@/lib/types";
import {
  getContentItems,
  getContract,
  getPaymentItems,
  getShipments,
} from "@/lib/fulfillment";
import { canCompleteDeal, canLeaveWonStage } from "@/lib/lifecycle";
import {
  agreementPreparationSummary,
  prepareAgreedDeal,
} from "@/lib/operations-autopilot";

const STAGE_STATUS: Record<Stage, { label: string; tone: "good" | "warn" | "neutral" }> = {
  lead: { label: "New lead", tone: "neutral" },
  contacted: { label: "Reached out · awaiting reply", tone: "neutral" },
  in_contact: { label: "They replied · not priced yet", tone: "neutral" },
  analyzing: { label: "Analyzing", tone: "neutral" },
  offer_sent: { label: "Offer sent · waiting", tone: "neutral" },
  negotiating: { label: "Negotiating", tone: "warn" },
  agreed: { label: "Agreed", tone: "good" },
  active: { label: "Active · in delivery", tone: "good" },
  completed: { label: "Completed", tone: "good" },
  declined: { label: "Declined", tone: "warn" },
};

export async function moveDealStage(dealId: number, stage: Stage) {
  if (!ALL_STAGES.includes(stage)) return { error: "Invalid stage" };
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (deal.stage === stage) return {};

  const content = getContentItems(dealId);
  const payments = getPaymentItems(dealId);
  const shipments = getShipments(dealId);
  const contract = getContract(dealId);
  if (deal.stage === "completed" && stage !== "agreed") {
    return { error: "Move a completed deal back to Agreed before changing any other stage." };
  }
  if (stage === "completed") {
    const completion = canCompleteDeal({
      currentStage: deal.stage,
      content,
      payments,
      shipments,
    });
    if (!completion.ok) return { error: completion.reason };
  }
  const leaving = canLeaveWonStage({
    currentStage: deal.stage,
    nextStage: stage,
    hasConfirmedContract: contract?.status === "confirmed",
    contentCount: content.length,
    paymentCount: payments.length,
    shipmentCount: shipments.length,
  });
  if (!leaving.ok) return { error: leaving.reason };

  const fields: Record<string, unknown> = {
    stage,
    status_label: STAGE_STATUS[stage].label,
    status_tone: STAGE_STATUS[stage].tone,
    your_move: stage === "negotiating" ? deal.your_move : 0,
  };
  // Stamp when outreach went out, once. Re-entering the stage after a detour through
  // Analyzing must not reset the clock — the question the board answers is "how long
  // has this creator been silent", and that started at the first contact.
  if (stage === "contacted" && deal.contacted_at == null) {
    fields.contacted_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  // Moving into Agreed locks the agreed price to the latest offer if we have one.
  if (stage === "agreed" && deal.agreed_price == null) {
    fields.agreed_price = deal.current_offer ?? deal.current_ask ?? null;
  }
  // Stamp when the deal was won — the monthly budget keys on this, and it must not
  // move when the deal is edited later. Completed-without-Agreed still counts as won.
  if ((stage === "agreed" || stage === "completed") && deal.agreed_at == null) {
    fields.agreed_at = new Date().toISOString().slice(0, 19).replace("T", " ");
  }
  updateDeal(dealId, fields);
  let setup: string | undefined;
  let warning: string | undefined;
  if (stage === "agreed") {
    try {
      const prepared = prepareAgreedDeal(dealId);
      setup = agreementPreparationSummary(prepared);
      warning = prepared.warning ?? undefined;
    } catch (error) {
      console.error("prepareAgreedDeal failed:", error);
      warning = "The deal is agreed, but its setup could not be prepared. Open Fulfillment to finish it.";
    }
  }
  revalidatePath("/");
  revalidatePath("/approvals");
  revalidatePath("/pipeline");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/content");
  revalidatePath("/partners");
  return { setup, warning };
}

/**
 * Records a deal as lost, with the reason. Losses only become useful — a win rate, a
 * signal that the ceiling is wrong — if the reason is captured at the moment you know it.
 */
export async function declineDealAction(
  dealId: number,
  input: { reason: DeclineReason; note?: string; revisitOn?: string | null }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!DECLINE_REASONS.some((r) => r.key === input.reason)) {
    return { error: "Unknown reason" };
  }
  const leaving = canLeaveWonStage({
    currentStage: deal.stage,
    nextStage: "declined",
    hasConfirmedContract: getContract(dealId)?.status === "confirmed",
    contentCount: getContentItems(dealId).length,
    paymentCount: getPaymentItems(dealId).length,
    shipmentCount: getShipments(dealId).length,
  });
  if (!leaving.ok) return { error: leaving.reason };

  updateDeal(dealId, {
    stage: "declined",
    decline_reason: input.reason,
    decline_note: input.note?.trim() || null,
    declined_at: new Date().toISOString().slice(0, 10),
    // Only a timing decline is worth resurfacing; the rest are closed.
    revisit_on: input.reason === "timing" ? input.revisitOn || null : null,
    status_label: DECLINE_REASON_LABEL[input.reason],
    status_tone: "warn",
    your_move: 0,
  });
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath(`/deals/${dealId}`);
  return {};
}

/** Puts a declined deal back on the board, clearing the loss record with it. */
export async function reopenDealAction(dealId: number, stage: Stage = "negotiating") {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (deal.stage !== "declined") return { error: "Only a declined deal can be reopened." };
  if (!(["lead", "contacted", "analyzing", "offer_sent", "negotiating"] as Stage[]).includes(stage)) {
    return { error: "Choose an active negotiation stage when reopening this deal." };
  }
  updateDeal(dealId, {
    stage,
    decline_reason: null,
    decline_note: null,
    declined_at: null,
    revisit_on: null,
    status_label: STAGE_STATUS[stage].label,
    status_tone: STAGE_STATUS[stage].tone,
  });
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath(`/deals/${dealId}`);
  return {};
}
