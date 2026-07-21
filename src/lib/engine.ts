import "server-only";
import {
  addMessage,
  clearJob,
  getDeal,
  getMessages,
  getPlaybook,
  getSetting,
  logUsage,
  updateDeal,
} from "./db";
import {
  analyzeDeal,
  recommendNextMove,
  MODEL,
  type ImageMediaType,
} from "./claude";
import type { Deal } from "./types";

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

export function playbookContext(platforms: string[]) {
  return {
    rulesByPlatform: Object.fromEntries(platforms.map((p) => [p, getPlaybook(p)])),
    unitEconomics: getSetting<Record<string, unknown>>("unit_economics"),
    negotiationStyle: getSetting<Record<string, unknown>>("negotiation_style"),
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
      playbook: playbookContext(platformsOf(deal)),
      reportPdfBase64: inputs.reportPdfBase64,
      reportImage: inputs.reportImage,
      theirMessage: theirMessage || undefined,
      channelUrl: inputs.channelUrl || deal.channel_url || undefined,
    });

    logUsage(dealId, "analysis", MODEL, result.usage.inputTokens, result.usage.outputTokens);

    updateDeal(dealId, {
      channel_url: inputs.channelUrl || deal.channel_url || result.extractedChannelUrl,
      analysis: JSON.stringify(result.analysis),
      anchor: result.numbers.anchor ?? deal.anchor,
      target: result.numbers.target ?? deal.target,
      walkaway: result.numbers.walkaway ?? deal.walkaway,
      breakeven: result.numbers.breakeven ?? deal.breakeven,
      avg_views: inputs.knownAvgViews ?? deal.avg_views ?? result.estimatedAvgViews,
      engagement_rate: inputs.knownEngagement ?? deal.engagement_rate ?? result.estimatedEngagementRate,
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
      playbook: playbookContext(platformsOf(deal)),
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
