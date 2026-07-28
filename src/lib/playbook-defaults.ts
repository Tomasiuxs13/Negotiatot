/**
 * Every Playbook default in one place, merged in when the Playbook is *read*.
 *
 * Merging at read time rather than at save time is the point: a field added after an
 * install used to be shown on the settings page (which merged for display) while the
 * engine — which reads the database — never saw it. The rules silently didn't apply,
 * and the page looked correct. Defaults now reach both.
 */

export type PlatformKey = "youtube" | "instagram" | "tiktok";

/**
 * Per-platform buying rules. Engagement floors are deliberately platform-specific:
 * a 3% engagement rate is strong on YouTube, unremarkable on TikTok, and unreachable
 * for most large Instagram accounts.
 */
export const DEFAULT_PLATFORM_RULES: Record<PlatformKey, Record<string, number>> = {
  youtube: {
    minIntegrations: 1,
    maxCpmIntegration: 28,
    maxCpmShort: 12,
    minAvgViews: 25000,
    // Likes + comments over views; 3–6% is the normal band for YouTube.
    minEngagementRate: 3.5,
    maxFakeFollowers: 15,
    maxPerDeal: 6000,
  },
  instagram: {
    minIntegrations: 2,
    maxCpmIntegration: 18,
    maxCpmShort: 8,
    minAvgViews: 15000,
    // Accounts over 100k routinely sit at 1–1.5%. A 3% floor rejects most of the
    // mid-tier creators worth working with.
    minEngagementRate: 1.5,
    maxFakeFollowers: 20,
    maxPerDeal: 4000,
  },
  tiktok: {
    minIntegrations: 3,
    maxCpmIntegration: 10,
    maxCpmShort: 6,
    minAvgViews: 30000,
    // TikTok engagement runs far higher — 5–12% is ordinary, so a 4% floor filters
    // almost nobody out.
    minEngagementRate: 6,
    maxFakeFollowers: 20,
    maxPerDeal: 3000,
  },
};

/**
 * Rules that don't vary by platform. Target market and monthly budget were previously
 * stored once per platform, so they could disagree with each other — and the monthly
 * cap was only ever read from YouTube, which made editing the other two do nothing.
 */
export const DEFAULT_GLOBAL_RULES: Record<string, number | string> = {
  geoLabel: "DACH",
  minGeoShare: 60,
  monthlyCap: 25000,
};

/**
 * The commercial facts behind every price. These belong to finance, not to the person
 * negotiating — an influencer manager can't be expected to know gross margin.
 *
 * The chain from a view to an order is: views → linkCtr → clicks → orderConversion →
 * orders. Both rates are needed; with only one the model has to invent the other.
 */
export const DEFAULT_UNIT_ECONOMICS: Record<string, number> = {
  aov: 120,
  /** Share of viewers who click the link or code. 0.5–2% is typical. */
  linkCtr: 1,
  /** Share of those clickers who buy. 2–4% is typical for ecommerce. */
  orderConversion: 3,
  grossMargin: 60,
  repeatFactor: 1.35,
  commissionPercent: 0,
  commissionPerOrder: 0,
  discountPercent: 0,
  discountFixed: 0,
  productCost: 0,
  minPaidFee: 100,
};

export const DEFAULT_NEGOTIATION_STYLE: Record<string, unknown> = {
  style: "balanced",
  anchorBelowTargetPct: [12, 15],
  warnAtWalkawayPct: 90,
  maxStepPct: 10,
  concessionLadder: [
    "Add smaller deliverable (story / short) instead of raising price",
    "Trade usage rights (60 d) for meeting their number",
    "Multi-video bundle at −12–15% per video",
    "Better commission tier instead of more cash",
    "Raise price — steps ≤ 10%, never past walk-away",
  ],
  commissionTiers: [],
  nonNegotiables: ["Draft approval before publish", "Net-30 payment", "Trackable link + promo code"],
};

/** Fields the manager is expected to set themselves. */
export const MANAGER_FIELDS = new Set([
  "geoLabel",
  "minGeoShare",
  "monthlyCap",
  "productCost",
  "minPaidFee",
  "commissionPercent",
  "commissionPerOrder",
  "discountPercent",
  "discountFixed",
  "minIntegrations",
  "maxPerDeal",
  "minAvgViews",
]);

/** Fields that should come from finance, and be entered once. */
export const FINANCE_FIELDS = new Set([
  "aov",
  "linkCtr",
  "orderConversion",
  "grossMargin",
  "repeatFactor",
]);
