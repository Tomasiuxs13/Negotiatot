import type { Deal, Platform } from "./types";
import { dealPlatforms } from "./types";

export interface Partner {
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
