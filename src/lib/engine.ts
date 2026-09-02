import "server-only";
import {
  addMessage,
  clearJob,
  getCampaign,
  getDeal,
  getMessages,
  getPartnerChannels,
  getPartnerDeals,
  getBrandProfile,
  getGlobalRules,
  getNegotiationStyle,
  getPlaybook,

  getUnitEconomics,
  logUsage,
  updateDeal,
} from "./db";
import { applyCampaignOverrides, parseOverrides } from "./campaigns";
import { deliverableCount, deliverableCountsByPlatform, isCrosspostText } from "./deliverables";
import { expectedOrdersFrom, resolveOffer } from "./commission";
import { parseRights } from "./rights";
import { recommendationReadyLabel } from "./recommendation-guard";
import {
  computeNumbers,
  type ComputedNumbers,
  type PricingInputs,
  type PricingRules,
} from "./pricing";
import {
  analyzeDeal,
  extractReportData,
  isExtractionUsable,
  recommendNextMove,
  MODEL,
  type ExtractedReport,
  type ImageMediaType,
} from "./claude";
import type { Deal } from "./types";
import { priorDeals, type PriorDeal } from "./partners";
import { parseTakeAmount } from "./manager-take";

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
export function playbookContext(
  platforms: string[],
  campaignId?: number | null,
  partnerId?: number | null
) {
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

  // The deal stores one blended avg_views; the per-platform split lives on the partner's
  // channel records. Without it the model prices every platform's placement — and any
  // crosspost — on the same number.
  const channelReach: Record<string, number> = {};
  if (partnerId != null) {
    for (const c of getPartnerChannels(partnerId)) {
      if (c.avg_views != null && c.avg_views > 0) channelReach[c.platform] = c.avg_views;
    }
  }

  return {
    rulesByPlatform,
    campaignName,
    globalRules: getGlobalRules(),
    brandProfile: getBrandProfile(),
    unitEconomics: getUnitEconomics(),
    negotiationStyle: getNegotiationStyle(),
    channelReach,
  };
}

type Ctx = ReturnType<typeof playbookContext>;

/** The brand's rules, in the shape the pricing module wants them. */
export function pricingRulesFor(ctx: Ctx): PricingRules {
  return {
    rulesByPlatform: ctx.rulesByPlatform,
    negotiationStyle: ctx.negotiationStyle,
    globalRules: ctx.globalRules,
    unitEconomics: ctx.unitEconomics as Record<string, number> | null,
  };
}

/**
 * Everything the four numbers are computed from, gathered in one place.
 *
 * Reach precedence: the extraction pass first (it read this creator's own report for this
 * deal), then whatever intake captured. Per-platform channel records override the blended
 * figure inside `computeNumbers`, which matters on any multi-platform deal — one blended
 * average prices a 500k-view YouTube integration and a 4k-view Reel identically.
 */
export function pricingInputsFor(deal: Deal, ctx: Ctx, extracted?: ExtractedReport): PricingInputs {
  const econ = (ctx.unitEconomics ?? {}) as Record<string, number>;
  const platforms = platformsOf(deal);
  const text = deal.deliverables ?? deal.format;
  const pieces = Math.max(
    1,
    deliverableCount({ text, platforms, rulesByPlatform: ctx.rulesByPlatform })
  );
  const blendedViews = extracted?.avgViews ?? deal.avg_views ?? null;
  const piecesByPlatform = deliverableCountsByPlatform(text, platforms);
  const reachByPlatform = { ...ctx.channelReach };
  // avg_views and an uploaded report are facts for the deal's primary/report platform,
  // never a blended fact that can be copied onto every selected channel.
  if (blendedViews != null && blendedViews > 0) reachByPlatform[deal.platform] = blendedViews;
  const { commission, discount } = resolveOffer(deal, econ);

  const hasScopedQuantities = Object.keys(piecesByPlatform).length > 0;
  const forecastViews = platforms.reduce((sum, platform) => {
    const views = reachByPlatform[platform] ?? 0;
    const quantity = isCrosspostText(text)
      ? 1
      : (piecesByPlatform[platform] ??
        (hasScopedQuantities ? 0 : platforms.length === 1 ? pieces : 1));
    return sum + views * quantity;
  }, 0);
  const expectedOrders = expectedOrdersFrom({
    views: forecastViews,
    linkCtrPct: Number(econ.linkCtr ?? 0),
    orderConversionPct: Number(econ.orderConversion ?? 0),
  });

  return {
    platforms,
    reachByPlatform,
    blendedViews,
    blendedViewsPlatform: deal.platform,
    deliverablesText: text,
    pieces,
    piecesByPlatform,
    crosspost: isCrosspostText(text),
    expectedOrders,
    commission,
    discount,
    rights: parseRights(deal.rights),
  };
}

/** The four rows the deal workspace renders, values and arithmetic both from code. */
export function displayNumbers(n: ComputedNumbers, qualityRationale: string) {
  const money = (v: number) => `$${v.toLocaleString("en-US")}`;
  const valuation = n.valuationWorkings.join("; ");
  const quality = n.qualityDiscountPct > 0 && qualityRationale ? ` ${qualityRationale}` : "";
  return [
    {
      label: "Anchor",
      value: n.anchor,
      // Each row explains its own number. These two used to carry the entire derivation
      // verbatim — the same paragraph printed twice, and neither one saying what its own
      // figure was for.
      explanation: `${n.targetWorkings.join("; ")}. Opening offer: below Target, defensible from the same CPM math.`,
    },
    {
      label: "Target",
      value: n.target,
      explanation:
        n.qualityDiscountPct > 0
          ? `Content and rights value ${money(n.fairValue)} less a ${n.qualityDiscountPct}% quality discount.${quality}`
          : `Content at the playbook's ceiling CPMs plus ${money(n.rightsPremium)} for rights, with no quality discount.${quality}`,
    },
    {
      label: "Walk-away",
      value: n.walkaway,
      explanation: n.capApplied
        ? `Capped by maxPerDeal. Content and rights would otherwise support ${money(n.fairValue)}. ${valuation}`
        : `${valuation}. Never adjusted for quality — this is what the deal can bear, not what it should cost.`,
    },
    {
      label: "Breakeven",
      value: n.breakeven,
      explanation: n.breakevenWorkings.join("; "),
    },
  ];
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
    /** A tall report cut into readable strips; sent in place of the document. */
    reportImages?: { base64: string; mediaType: ImageMediaType }[];
    channelUrl?: string;
    knownAvgViews?: number | null;
    knownEngagement?: number | null;
  } = {}
) {
  try {
    const deal = getDeal(dealId);
    // Clear the job even on the missing-deal path: setJob already ran in the action,
    // and returning without it leaves the row spinning "Analyzing…" until the
    // stale-job sweep fifteen minutes later.
    if (!deal) {
      clearJob(dealId);
      return;
    }

    const theirMessage = getMessages(dealId)
      .filter((m) => m.sender === "them")
      .map((m) => m.body)
      .join("\n\n");

    // Two passes: a cheap model transcribes the report, the expensive one judges it.
    // Only OCR-grade work moves down a tier — no negotiation decision is made in the
    // extraction — and if it comes back unusable we send the raw document as before
    // rather than analyse on numbers nobody can vouch for.
    let extracted: ExtractedReport | undefined;
    if (inputs.reportPdfBase64 || inputs.reportImage || inputs.reportImages?.length) {
      try {
        const pass = await extractReportData({
          pdfBase64: inputs.reportPdfBase64,
          image: inputs.reportImage,
          images: inputs.reportImages,
        });
        logUsage(dealId, "extraction", pass.model, pass.usage.inputTokens, pass.usage.outputTokens);
        if (isExtractionUsable(pass.extracted)) {
          extracted = pass.extracted;
        } else {
          console.warn(`extraction unusable for deal ${dealId}; analysing from the raw document`);
        }
      } catch (err) {
        // A failed extraction must never fail the analysis — it is an optimisation.
        console.error("extraction pass failed, falling back to the raw document:", err);
      }
    }

    const ctx = playbookContext(platformsOf(deal), deal.campaign_id, deal.partner_id);

    // The four numbers are computed twice, and the order is the point.
    //
    // Before the call, from whatever reach is already known — the extraction pass, the
    // deal record, the partner's channels — so the model is *given* the numbers and
    // grades against them instead of proposing them. Walk-away in particular is a budget
    // ceiling that decides whether the copilot may draft an offer at all; it has no
    // business being an output of a call that reads a stranger's PDF.
    //
    // After the call, again, because the model may have researched better views than we
    // started with, and because the quality discount it judged is an input to Target.
    // What gets stored is always this second computation, never anything the model wrote.
    const pricingInputs = pricingInputsFor(deal, ctx, extracted);
    const precomputed = computeNumbers(pricingInputs, pricingRulesFor(ctx));

    const result = await analyzeDeal({
      deal,
      playbook: ctx,
      computed: precomputed,
      // Both are still passed: analyzeDeal attaches the document only when there is no
      // usable extraction, so the fallback needs no separate call path.
      reportPdfBase64: inputs.reportPdfBase64,
      reportImage: inputs.reportImage,
      reportImages: inputs.reportImages,
      extracted,
      theirMessage: theirMessage || undefined,
      channelUrl: inputs.channelUrl || deal.channel_url || undefined,
      history: dealHistory(deal),
    });

    // Views precedence mirrors the updateDeal call below, so the numbers are computed on
    // exactly the figure that ends up stored — a mismatch here would price the deal on
    // one number and display another.
    const resolvedViews =
      inputs.knownAvgViews ??
      (deal.audience_locked ? deal.avg_views : (result.estimatedAvgViews ?? deal.avg_views));
    const numbers = computeNumbers(
      {
        ...pricingInputs,
        blendedViews: resolvedViews ?? pricingInputs.blendedViews,
        qualityDiscountPct: result.qualityDiscountPct,
      },
      pricingRulesFor(ctx)
    );

    logUsage(
      dealId,
      "analysis",
      MODEL,
      result.usage.inputTokens,
      result.usage.outputTokens,
      result.usage.cacheCreationTokens ?? 0,
      result.usage.cacheReadTokens ?? 0
    );

    updateDeal(dealId, {
      channel_url: inputs.channelUrl || deal.channel_url || result.extractedChannelUrl,
      analysis: JSON.stringify({
        ...result.analysis,
        // The display rows are built here, from the computed values and the workings the
        // pricing module wrote. Letting the model narrate numbers it no longer produces
        // is how the explanation drifts from the figure it claims to explain.
        numbers: displayNumbers(numbers, result.qualityRationale),
      }),
      // A computed zero is a real answer ("no reach on record", "no fee is affordable"),
      // but it is not a reason to erase a number a human already corrected — so an
      // unpriceable deal keeps what it had rather than silently resetting to $0.
      anchor: numbers.fairValue > 0 ? numbers.anchor : deal.anchor,
      target: numbers.fairValue > 0 ? numbers.target : deal.target,
      walkaway: numbers.fairValue > 0 ? numbers.walkaway : deal.walkaway,
      breakeven: numbers.breakeven || deal.breakeven,
      // Precedence: a number typed for THIS run, then a hand-corrected stored value,
      // then the researched estimate, then whatever intake captured. The researched
      // estimate outranks a stale intake figure (often a Shorts-diluted blend the
      // analysis itself refuses to price on) — but it must never outrank a human
      // correction, or "fix 4,900 → 79,000, re-run" silently re-breaks the deal it
      // just fixed.
      avg_views:
        inputs.knownAvgViews ??
        (deal.audience_locked ? deal.avg_views : (result.estimatedAvgViews ?? deal.avg_views)),
      engagement_rate:
        inputs.knownEngagement ??
        (deal.audience_locked
          ? deal.engagement_rate
          : (result.estimatedEngagementRate ?? deal.engagement_rate)),
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
/**
 * Did the draft honour the manager's instruction on price?
 *
 * Only reports a departure when the take named a figure we could read and the draft
 * offers a materially different one — a rounding difference is not a departure, and an
 * instruction with no number in it cannot be departed from.
 */
function takeDeparture(
  take: string | null | undefined,
  drafted: number
): { takeDeparture: { asked: number; drafted: number } } | null {
  if (!take) return null;
  const asked = parseTakeAmount(take);
  if (!asked) return null;
  if (Math.abs(asked.total - drafted) <= Math.max(1, asked.total * 0.02)) return null;
  return { takeDeparture: { asked: asked.total, drafted } };
}

export async function performRecommendation(
  dealId: number,
  take?: string | null,
  approvedOverride?: number | null
) {
  try {
    const deal = getDeal(dealId);
    if (!deal) {
      clearJob(dealId);
      return;
    }
    const messages = getMessages(dealId);
    const isOpening = !messages.some((m) => m.sender !== "copilot");

    const reco = await recommendNextMove({
      deal,
      messages,
      playbook: playbookContext(platformsOf(deal), deal.campaign_id, deal.partner_id),
      history: dealHistory(deal),
      take,
      approvedOverride,
    });

    logUsage(dealId, "recommendation", MODEL, reco.usage.inputTokens, reco.usage.outputTokens);

    addMessage(dealId, "copilot", reco.headline, {
      round: Math.max(deal.round, 1),
      headline: reco.headline,
      proposedOffer: reco.proposedOffer,
      pills: reco.pills,
      reasoning: reco.reasoning,
      drafts: reco.drafts,
      // Stored so the card can say what this draft came from, and so a re-run starts from
      // the same instruction instead of silently dropping it.
      ...(take ? { take } : {}),
      // When the Copilot did not do as it was told, say so on the card. Silently shipping
      // a draft that offers a different number than the manager asked for is the one
      // outcome worse than refusing: they would send it believing it was theirs.
      ...(takeDeparture(take, reco.proposedOffer) ?? {}),
      // The record of a deliberate trade: this fee is above the deal's own ceiling and
      // the manager said so knowingly.
      ...(approvedOverride != null ? { approvedOverride } : {}),
    });

    const fields: Record<string, unknown> = {
      // addTheirReply marks the row as drafting before this background job starts.
      // Every successful path must replace that transient label, not only openings.
      status_label: recommendationReadyLabel(deal.round, isOpening),
      status_tone: "good",
    };
    if (reco.theirCurrentPosition != null) {
      const position = Math.round(reco.theirCurrentPosition);
      fields.current_ask = position;
      // Their opening number, when the analysis never saw one.
      //
      // performAnalysis was the only writer of first_ask, so a deal analysed before the
      // creator named a price kept it null forever — and four things downstream read it:
      // the price ladder drops the "R1 · their ask" rung, "Saved:" never renders on the
      // card or the progress bar, the partner's lifetime savings under-counts, and every
      // later recommendation prompt says "Their first ask: $unknown". Guarded the same way
      // performAnalysis guards it, so a real first ask is never overwritten by a later
      // round's position.
      if (deal.first_ask == null) fields.first_ask = position;
    }
    if (isOpening) {
      fields.round = Math.max(deal.round, 1);
      fields.your_move = 1;
    }
    updateDeal(dealId, fields);
    clearJob(dealId);
  } catch (err) {
    console.error("performRecommendation failed:", err);
    // Reset the label too: addTheirReply sets "Copilot drafting…" before the job runs,
    // and clearing only the job left the pipeline claiming a draft was coming forever.
    updateDeal(dealId, { status_label: "Recommendation failed", status_tone: "warn" });
    clearJob(
      dealId,
      `Recommendation failed: ${err instanceof Error ? err.message : "unknown error"}`
    );
  }
}
