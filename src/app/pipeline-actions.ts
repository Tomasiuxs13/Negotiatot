"use server";

import { revalidatePath } from "next/cache";
import { getDeal, updateDeal } from "@/lib/db";
import type { Stage } from "@/lib/types";

const VALID: Stage[] = ["analyzing", "offer_sent", "negotiating", "agreed", "declined"];

const STAGE_STATUS: Record<Stage, { label: string; tone: "good" | "warn" | "neutral" }> = {
  analyzing: { label: "Analyzing", tone: "neutral" },
  offer_sent: { label: "Offer sent · waiting", tone: "neutral" },
  negotiating: { label: "Negotiating", tone: "warn" },
  agreed: { label: "Agreed", tone: "good" },
  declined: { label: "Declined", tone: "warn" },
};

export async function moveDealStage(dealId: number, stage: Stage) {
  if (!VALID.includes(stage)) return { error: "Invalid stage" };
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
  updateDeal(dealId, fields);
  revalidatePath("/");
  revalidatePath(`/deals/${dealId}`);
  return {};
}
