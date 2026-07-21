"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { addMessage, getDeal, setJob, updateDeal } from "@/lib/db";
import { hasApiKey } from "@/lib/claude";
import { performAnalysis, performRecommendation } from "@/lib/engine";

const NO_KEY_ERROR =
  "No ANTHROPIC_API_KEY configured — add it to counterpart/.env.local and restart the dev server.";

export async function markDraftAsSent(dealId: number, text: string, proposedOffer: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  addMessage(dealId, "us", text, { offer: proposedOffer });
  updateDeal(dealId, {
    current_offer: proposedOffer,
    your_move: 0,
    stage: deal.stage === "analyzing" ? "offer_sent" : deal.stage,
    status_label: `Round ${Math.max(deal.round, 1)} · waiting on them`,
    status_tone: "neutral",
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

export async function addTheirReply(dealId: number, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Empty message" };
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };

  addMessage(dealId, "them", trimmed);
  const round = deal.round + 1;
  updateDeal(dealId, {
    round,
    your_move: 1,
    stage: deal.stage === "offer_sent" || deal.stage === "analyzing" ? "negotiating" : deal.stage,
    status_label: `Round ${round} · Copilot drafting…`,
    status_tone: "warn",
  });

  if (!hasApiKey()) {
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/");
  revalidatePath("/pipeline");
    return { error: `Message saved, but recommendations are unavailable: ${NO_KEY_ERROR}` };
  }

  setJob(dealId, "recommending");
  after(() => performRecommendation(dealId));
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

export async function generateOpeningOffer(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!hasApiKey()) return { error: NO_KEY_ERROR };

  setJob(dealId, "recommending");
  after(() => performRecommendation(dealId));
  revalidatePath(`/deals/${dealId}`);
  return {};
}

export async function runAnalysis(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!hasApiKey()) return { error: NO_KEY_ERROR };

  setJob(dealId, "analyzing");
  updateDeal(dealId, { status_label: "Analyzing…", status_tone: "neutral" });
  after(() => performAnalysis(dealId));
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

export async function saveActuals(
  dealId: number,
  actuals: { views?: number | null; clicks?: number | null; orders?: number | null; revenue?: number | null }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  updateDeal(dealId, {
    actual_views: actuals.views ?? null,
    actual_clicks: actuals.clicks ?? null,
    actual_orders: actuals.orders ?? null,
    actual_revenue: actuals.revenue ?? null,
    actuals_logged_at: new Date().toISOString(),
    stage: deal.stage === "agreed" || deal.agreed_price != null ? "agreed" : deal.stage,
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/benchmarks");
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

export async function deleteDeal(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const { default: db } = await import("@/lib/db");
  db.prepare("DELETE FROM messages WHERE deal_id = ?").run(dealId);
  db.prepare("DELETE FROM deals WHERE id = ?").run(dealId);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}
