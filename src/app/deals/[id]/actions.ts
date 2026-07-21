"use server";

import { revalidatePath } from "next/cache";
import { addMessage, getDeal, getMessages, getPlaybook, getSetting, updateDeal } from "@/lib/db";
import { analyzeDeal, recommendNextMove, hasApiKey } from "@/lib/claude";

function playbookContext(platforms: string[]) {
  return {
    rulesByPlatform: Object.fromEntries(platforms.map((p) => [p, getPlaybook(p)])),
    unitEconomics: getSetting<Record<string, unknown>>("unit_economics"),
    negotiationStyle: getSetting<Record<string, unknown>>("negotiation_style"),
  };
}

function platformsOf(deal: { platform: string; platforms: string | null }): string[] {
  if (deal.platforms) {
    try {
      const parsed = JSON.parse(deal.platforms) as string[];
      if (parsed.length > 0) return parsed;
    } catch {
      /* fall through */
    }
  }
  return [deal.platform];
}

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
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");

  if (!hasApiKey()) {
    return {
      error:
        "Message saved, but no ANTHROPIC_API_KEY is configured — add it to counterpart/.env.local and restart to get recommendations.",
    };
  }

  try {
    const fresh = getDeal(dealId)!;
    const reco = await recommendNextMove({
      deal: fresh,
      messages: getMessages(dealId),
      playbook: playbookContext(platformsOf(fresh)),
    });
    addMessage(dealId, "copilot", reco.headline, {
      round,
      headline: reco.headline,
      proposedOffer: reco.proposedOffer,
      pills: reco.pills,
      reasoning: reco.reasoning,
      drafts: reco.drafts,
    });
    // Their latest position, as read by the Copilot from the full conversation.
    if (reco.theirCurrentPosition != null) {
      updateDeal(dealId, { current_ask: Math.round(reco.theirCurrentPosition) });
    }
    revalidatePath(`/deals/${dealId}`);
    return {};
  } catch (err) {
    console.error("recommendNextMove failed:", err);
    return {
      error: `Message saved, but the Copilot recommendation failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
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
  return {};
}

export async function deleteDeal(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const { default: db } = await import("@/lib/db");
  db.prepare("DELETE FROM messages WHERE deal_id = ?").run(dealId);
  db.prepare("DELETE FROM deals WHERE id = ?").run(dealId);
  revalidatePath("/");
  return {};
}

export async function generateOpeningOffer(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!hasApiKey()) {
    return {
      error:
        "No ANTHROPIC_API_KEY configured — add it to counterpart/.env.local and restart the dev server.",
    };
  }
  try {
    const reco = await recommendNextMove({
      deal,
      messages: getMessages(dealId),
      playbook: playbookContext(platformsOf(deal)),
    });
    addMessage(dealId, "copilot", reco.headline, {
      round: Math.max(deal.round, 1),
      headline: reco.headline,
      proposedOffer: reco.proposedOffer,
      pills: reco.pills,
      reasoning: reco.reasoning,
      drafts: reco.drafts,
    });
    updateDeal(dealId, {
      round: Math.max(deal.round, 1),
      your_move: 1,
      status_label: "Opening offer ready",
      status_tone: "good",
    });
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/");
    return {};
  } catch (err) {
    console.error("generateOpeningOffer failed:", err);
    return {
      error: `Opening offer failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

export async function runAnalysis(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!hasApiKey()) {
    return {
      error:
        "No ANTHROPIC_API_KEY configured — add it to counterpart/.env.local and restart the dev server.",
    };
  }

  try {
    const theirMessage = getMessages(dealId)
      .filter((m) => m.sender === "them")
      .map((m) => m.body)
      .join("\n\n");

    const result = await analyzeDeal({
      deal,
      playbook: playbookContext(platformsOf(deal)),
      theirMessage: theirMessage || undefined,
    });

    updateDeal(dealId, {
      analysis: JSON.stringify(result.analysis),
      anchor: result.numbers.anchor ?? deal.anchor,
      target: result.numbers.target ?? deal.target,
      walkaway: result.numbers.walkaway ?? deal.walkaway,
      breakeven: result.numbers.breakeven ?? deal.breakeven,
      avg_views: deal.avg_views ?? result.estimatedAvgViews,
      engagement_rate: deal.engagement_rate ?? result.estimatedEngagementRate,
      status_label:
        result.analysis.verdict === "accept"
          ? "Good deal"
          : result.analysis.verdict === "decline"
            ? (result.theirAsk ?? deal.current_ask) != null
              ? "Above walk-away"
              : "Verdict: walk away"
            : "Analyzed · negotiable",
      status_tone:
        result.analysis.verdict === "accept"
          ? "good"
          : result.analysis.verdict === "decline"
            ? "warn"
            : "neutral",
    });
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/");
    return {};
  } catch (err) {
    console.error("runAnalysis failed:", err);
    return { error: `Analysis failed: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}
