import type { Deal, Platform } from "./types";
import { dealPlatforms } from "./types";
import type { ContentItem } from "./fulfillment-types";

export interface Partner {
  legal_name?: string | null;
  company_name?: string | null;
  tax_id?: string | null;
  legal_address?: string | null;
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  tags: string; // JSON array
  archived: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface PartnerChannel {
  id: number;
  partner_id: number;
  platform: Platform;
  handle: string | null;
  url: string | null;
  followers: number | null;
  avg_views: number | null;
  engagement_rate: number | null;
  updated_at: string;
}

/** Evidence retained from an external discovery/analytics provider. */
export interface PartnerSourceRecord {
  id: number;
  partner_id: number;
  source: string;
  external_id: string | null;
  profile_url: string | null;
  raw_data: string;
  imported_at: string;
}

/** A creator can have an agency and a personal contact; `partners.email` remains primary. */
export interface PartnerContact {
  id: number;
  partner_id: number;
  email: string;
  label: string | null;
  source: string | null;
  created_at: string;
}

export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export interface PartnerStats {
  totalDeals: number;
  activeDeals: number;
  wonDeals: number;
  /** Agreed fees across won deals — money promised, not necessarily money out. */
  committed: number;
  /** Fees on deals that have been fully wrapped up. */
  paid: number;
  /**
   * CPM from deals with logged actuals only. A predicted CPM averaged together with a
   * real one produces a number that means nothing.
   */
  actualCpm: number | null;
  savedVsAsk: number;
  lastDealAt: string | null;
}

export interface PartnerOperationalStats {
  promisedContent: number;
  deliveredContent: number;
  verifiedContent: number;
  onTimeRate: number | null;
  averageRevisionRounds: number | null;
}

export interface PartnerPrefill {
  partnerId: number;
  name: string;
  email: string | null;
  platforms: string[];
  primaryPlatform: string | null;
  channelUrl: string | null;
  avgViews: number | null;
  engagementRate: number | null;
  dealCount: number;
  lastAgreedPrice: number | null;
  lastDealDate: string | null;
  lastScope: string | null;
  lastActualCpm: number | null;
  promisedContent: number;
  deliveredContent: number;
  onTimeRate: number | null;
  averageRevisionRounds: number | null;
}

export type PartnerStatus = "prospect" | "negotiating" | "delivering" | "past" | "lapsed";

export const PARTNER_STATUS_LABEL: Record<PartnerStatus, string> = {
  prospect: "Prospect",
  negotiating: "In negotiation",
  delivering: "Delivering",
  past: "Worked with",
  lapsed: "Lapsed",
};

/**
 * Where the relationship stands, derived from the deals rather than maintained by hand
 * — a status you have to remember to update is a status that lies.
 */
export function partnerStatus(deals: Deal[], today = new Date().toISOString().slice(0, 10)): PartnerStatus {
  if (deals.length === 0) return "prospect";

  if (deals.some((d) => d.stage === "agreed")) return "delivering";
  if (deals.some((d) => d.stage === "offer_sent" || d.stage === "negotiating" || d.stage === "analyzing"))
    return "negotiating";

  const completed = deals.filter((d) => d.stage === "completed");
  if (completed.length > 0) {
    const last = completed.map((d) => d.updated_at).sort().at(-1)!;
    const months =
      (new Date(today + "T00:00:00Z").getTime() -
        new Date(last.slice(0, 10) + "T00:00:00Z").getTime()) /
      (30 * 86400000);
    return months >= 6 ? "lapsed" : "past";
  }

  return "prospect";
}

/** One past collaboration, in the terms that matter when pricing the next one. */
export interface PriorDeal {
  date: string;
  scope: string | null;
  platforms: string[];
  firstAsk: number | null;
  agreedPrice: number | null;
  actualViews: number | null;
  actualCpm: number | null;
}

/**
 * What you've already paid this creator. The strongest anchor in a repeat negotiation
 * is your own history with them, so the engine should never argue without it.
 */
export function priorDeals(deals: Deal[], excludeDealId?: number): PriorDeal[] {
  return deals
    .filter(
      (d) =>
        d.id !== excludeDealId &&
        (d.stage === "agreed" || d.stage === "completed") &&
        d.agreed_price != null
    )
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((d) => ({
      date: d.updated_at.slice(0, 10),
      scope: d.deliverables ?? d.format ?? null,
      platforms: dealPlatforms(d),
      firstAsk: d.first_ask,
      agreedPrice: d.agreed_price,
      actualViews: d.actual_views,
      actualCpm:
        d.actual_views && d.agreed_price ? (d.agreed_price / d.actual_views) * 1000 : null,
    }));
}

/** Lifetime numbers for a partner, computed from their deals. */
export function partnerStats(deals: Deal[]): PartnerStats {
  const won = deals.filter((d) => d.stage === "agreed" || d.stage === "completed");
  const active = deals.filter(
    (d) => d.stage !== "agreed" && d.stage !== "completed" && d.stage !== "declined"
  );

  const withActuals = won.filter((d) => d.agreed_price && d.actual_views);
  const actualCpm =
    withActuals.length > 0
      ? withActuals.reduce((s, d) => s + (d.agreed_price! / d.actual_views!) * 1000, 0) /
        withActuals.length
      : null;

  return {
    totalDeals: deals.length,
    activeDeals: active.length,
    wonDeals: won.length,
    committed: won.reduce((s, d) => s + (d.agreed_price ?? 0), 0),
    paid: deals
      .filter((d) => d.stage === "completed")
      .reduce((s, d) => s + (d.agreed_price ?? 0), 0),
    actualCpm,
    savedVsAsk: won.reduce(
      (s, d) => s + Math.max(0, (d.first_ask ?? 0) - (d.agreed_price ?? 0)),
      0
    ),
    lastDealAt: deals.map((d) => d.updated_at).sort().at(-1) ?? null,
  };
}

/** Operational history used for repeat-deal planning; no subjective creator score. */
export function partnerOperationalStats(
  deals: Deal[],
  contentItems: ContentItem[]
): PartnerOperationalStats {
  const dealIds = new Set(deals.map((deal) => deal.id));
  const items = contentItems.filter((item) => dealIds.has(item.deal_id));
  const delivered = items.filter(
    (item) => item.status === "posted" || item.status === "verified"
  );
  const dated = delivered.filter((item) => item.due_date && item.posted_at);
  const revised = items.filter((item) => (item.revision_round ?? 0) > 0);

  return {
    promisedContent: items.length,
    deliveredContent: delivered.length,
    verifiedContent: items.filter((item) => item.status === "verified").length,
    onTimeRate:
      dated.length > 0
        ? dated.filter((item) => item.posted_at!.slice(0, 10) <= item.due_date!).length /
          dated.length
        : null,
    averageRevisionRounds:
      revised.length > 0
        ? revised.reduce((sum, item) => sum + (item.revision_round ?? 0), 0) / revised.length
        : null,
  };
}
