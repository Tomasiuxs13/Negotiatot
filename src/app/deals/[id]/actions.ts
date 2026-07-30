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
    status_label: `Round ${round} · your move`,
    status_tone: "warn",
  });

  if (!hasApiKey()) {
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/");
  revalidatePath("/pipeline");
    return { error: `Message saved, but recommendations are unavailable: ${NO_KEY_ERROR}` };
  }

  if (!setJob(dealId, "recommending")) {
    return { error: "Message saved — but the Copilot is already working on this deal. Regenerate when it finishes." };
  }
  // "Drafting" is only claimed once the job actually is — a refused job that left this
  // label up promised a draft that was never coming.
  updateDeal(dealId, { status_label: `Round ${round} · Copilot drafting…` });
  after(() => performRecommendation(dealId));
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

/**
 * Runs the Copilot's next move. Used both for the opening offer and to redo an existing
 * recommendation against changed rules — the work is identical either way.
 */
export async function runRecommendation(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!hasApiKey()) return { error: NO_KEY_ERROR };

  if (!setJob(dealId, "recommending")) {
    return { error: "The Copilot is already working on this deal — wait for it to finish." };
  }
  after(() => performRecommendation(dealId));
  revalidatePath(`/deals/${dealId}`);
  return {};
}

export async function runAnalysis(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!hasApiKey()) return { error: NO_KEY_ERROR };

  if (!setJob(dealId, "analyzing")) {
    return { error: "The Copilot is already working on this deal — wait for it to finish." };
  }
  updateDeal(dealId, { status_label: "Analyzing…", status_tone: "neutral" });
  after(() => performAnalysis(dealId));
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

/**
 * Correct the audience figures a deal is priced from, and re-price on them.
 *
 * These could only be set at intake, so a wrong number was permanent: a 445k-subscriber
 * channel captured at 4,900 average views stayed there through every re-run, and the
 * analysis — which flagged the figure as impossible — had no choice but to price on it
 * and produced a $100-a-video offer. Views are the single input every number derives
 * from, so they have to be correctable after intake.
 */
export async function saveAudienceData(
  dealId: number,
  avgViews: number | null,
  engagementRate: number | null
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (avgViews != null && (!Number.isFinite(avgViews) || avgViews < 0)) {
    return { error: "Average views must be a positive number." };
  }
  if (engagementRate != null && (!Number.isFinite(engagementRate) || engagementRate < 0)) {
    return { error: "Engagement rate must be a positive number." };
  }

  // Lock the figures: a hand-set number is a correction, and a re-run analysis must
  // not overwrite it with a fresh estimate of the same wrong thing.
  updateDeal(dealId, { avg_views: avgViews, engagement_rate: engagementRate, audience_locked: 1 });
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
    // Logging results implies the deal closed — but never drag a wrapped-up deal
    // back out of Completed.
    stage:
      deal.stage === "completed" || deal.stage === "agreed" || deal.agreed_price == null
        ? deal.stage
        : "agreed",
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/benchmarks");
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

export async function saveDealNotesAction(dealId: number, notes: string) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (notes.length > 5000) return { error: "Notes are too long — keep them under 5,000 characters." };
  updateDeal(dealId, { notes: notes.trim() || null });
  revalidatePath(`/deals/${dealId}`);
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
