import "server-only";
import {
  addMessage,
  clearJob,
  getCampaign,
  getDeal,
  getMessages,
  getPartnerDeals,
  getBrandProfile,
  getGlobalRules,
  getNegotiationStyle,
  getPlaybook,
  getSetting,
  getUnitEconomics,
  logUsage,
  updateDeal,
} from "./db";
import { applyCampaignOverrides, parseOverrides } from "./campaigns";
import {
  analyzeDeal,
  recommendNextMove,
  MODEL,
  type ImageMediaType,
} from "./claude";
import type { Deal } from "./types";
import { priorDeals, type PriorDeal } from "./partners";

export function platformsOf(deal: Pick<Deal, "platform" | "platforms">): string[] {
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

/** What this creator has already been paid, so a repeat negotiation isn't argued blind. */
export function dealHistory(deal: Deal): PriorDeal[] {
  if (deal.partner_id == null) return [];
  return priorDeals(getPartnerDeals(deal.partner_id), deal.id);
}

/**
 * Builds the rules the engine negotiates by: the global Playbook for each
 * platform, with the deal's campaign overrides layered on top.
 */
export function playbookContext(platforms: string[], campaignId?: number | null) {
  let rulesByPlatform: Record<string, Record<string, unknown> | null> = Object.fromEntries(
    platforms.map((p) => [p, getPlaybook(p)])
  );

  let campaignName: string | undefined;
  if (campaignId != null) {
    const campaign = getCampaign(campaignId);
    if (campaign) {
      campaignName = campaign.name;
      rulesByPlatform = applyCampaignOverrides(rulesByPlatform, parseOverrides(campaign.overrides));
    }
  }

  return {
    rulesByPlatform,
    campaignName,
    globalRules: getGlobalRules(),
    brandProfile: getBrandProfile(),
    unitEconomics: getUnitEconomics(),
    negotiationStyle: getNegotiationStyle(),
  };
}

/**
 * Runs the full deal analysis and stores the result. Called from `after()` —
 * the response has already been sent; the UI polls the deal's job_status.
 */
export async function performAnalysis(
  dealId: number,
  inputs: {
    reportPdfBase64?: string;
    reportImage?: { base64: string; mediaType: ImageMediaType };
    channelUrl?: string;
    knownAvgViews?: number | null;
    knownEngagement?: number | null;
  } = {}
) {
  try {
    const deal = getDeal(dealId);
    if (!deal) return;

    const theirMessage = getMessages(dealId)
      .filter((m) => m.sender === "them")
      .map((m) => m.body)
      .join("\n\n");

    const result = await analyzeDeal({
      deal,
      playbook: playbookContext(platformsOf(deal), deal.campaign_id),
      reportPdfBase64: inputs.reportPdfBase64,
      reportImage: inputs.reportImage,
      theirMessage: theirMessage || undefined,
      channelUrl: inputs.channelUrl || deal.channel_url || undefined,
      history: dealHistory(deal),
    });

    logUsage(dealId, "analysis", MODEL, result.usage.inputTokens, result.usage.outputTokens);

    updateDeal(dealId, {
      channel_url: inputs.channelUrl || deal.channel_url || result.extractedChannelUrl,
      analysis: JSON.stringify(result.analysis),
      anchor: result.numbers.anchor ?? deal.anchor,
      target: result.numbers.target ?? deal.target,
      walkaway: result.numbers.walkaway ?? deal.walkaway,
      breakeven: result.numbers.breakeven ?? deal.breakeven,
      // The researched estimate outranks whatever intake captured. An intake figure is
      // often a blended channel average — Shorts and long-form together — while the
      // analysis prices integrations on long-form alone and says so. Keeping intake's
      // number left the deal priced on one figure and every downstream forecast on
      // another: Gary Bembridge was valued at 79k views while his commission tiers were
      // filtered against 4.9k, hiding rungs he clears comfortably. A number the manager
      // typed for THIS run still wins — that's an explicit correction, not a stale one.
      avg_views: inputs.knownAvgViews ?? result.estimatedAvgViews ?? deal.avg_views,
      engagement_rate:
        inputs.knownEngagement ?? result.estimatedEngagementRate ?? deal.engagement_rate,
      first_ask: deal.first_ask ?? result.theirAsk,
      current_ask: deal.current_ask ?? result.theirAsk,
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
    clearJob(dealId);
  } catch (err) {
    console.error("performAnalysis failed:", err);
    updateDeal(dealId, { status_label: "Analysis failed", status_tone: "warn" });
    clearJob(dealId, `Analysis failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

/**
 * Generates the next-move recommendation (or the opening offer when the
 * thread is empty) and stores it as a copilot message. Called from `after()`.
 */
export async function performRecommendation(dealId: number) {
  try {
    const deal = getDeal(dealId);
    if (!deal) return;
    const messages = getMessages(dealId);
    const isOpening = !messages.some((m) => m.sender !== "copilot");

    const reco = await recommendNextMove({
      deal,
      messages,
      playbook: playbookContext(platformsOf(deal), deal.campaign_id),
      history: dealHistory(deal),
    });

    logUsage(dealId, "recommendation", MODEL, reco.usage.inputTokens, reco.usage.outputTokens);

    addMessage(dealId, "copilot", reco.headline, {
      round: Math.max(deal.round, 1),
      headline: reco.headline,
      proposedOffer: reco.proposedOffer,
      pills: reco.pills,
      reasoning: reco.reasoning,
      drafts: reco.drafts,
    });

    const fields: Record<string, unknown> = {};
    if (reco.theirCurrentPosition != null) {
      fields.current_ask = Math.round(reco.theirCurrentPosition);
    }
    if (isOpening) {
      fields.round = Math.max(deal.round, 1);
      fields.your_move = 1;
      fields.status_label = "Opening offer ready";
      fields.status_tone = "good";
    }
    if (Object.keys(fields).length > 0) updateDeal(dealId, fields);
    clearJob(dealId);
  } catch (err) {
    console.error("performRecommendation failed:", err);
    clearJob(
      dealId,
      `Recommendation failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
}
