"use server";

import { revalidatePath } from "next/cache";
import { getDeal, updateDeal } from "@/lib/db";
import type { Stage } from "@/lib/types";
import { ALL_STAGES, DECLINE_REASONS, DECLINE_REASON_LABEL, type DeclineReason } from "@/lib/types";

const STAGE_STATUS: Record<Stage, { label: string; tone: "good" | "warn" | "neutral" }> = {
  lead: { label: "New lead", tone: "neutral" },
  contacted: { label: "Reached out · awaiting reply", tone: "neutral" },
  analyzing: { label: "Analyzing", tone: "neutral" },
  offer_sent: { label: "Offer sent · waiting", tone: "neutral" },
  negotiating: { label: "Negotiating", tone: "warn" },
  agreed: { label: "Agreed", tone: "good" },
  completed: { label: "Completed", tone: "good" },
  declined: { label: "Declined", tone: "warn" },
};

export async function moveDealStage(dealId: number, stage: Stage) {
  if (!ALL_STAGES.includes(stage)) return { error: "Invalid stage" };
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (deal.stage === stage) return {};

  const fields: Record<string, unknown> = {
    stage,
    status_label: STAGE_STATUS[stage].label,
    status_tone: STAGE_STATUS[stage].tone,
    your_move: stage === "negotiating" ? deal.your_move : 0,
  };
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
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath(`/deals/${dealId}`);
  return {};
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
