import type { Deal, Platform } from "./types";

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
