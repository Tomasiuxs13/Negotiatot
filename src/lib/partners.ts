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
  totalSpend: number;
  avgClosedCpm: number | null;
  savedVsAsk: number;
  lastDealAt: string | null;
}

/** Lifetime numbers for a partner, computed from their deals. */
export function partnerStats(deals: Deal[]): PartnerStats {
  const won = deals.filter((d) => d.stage === "agreed");
  const active = deals.filter(
    (d) => d.stage !== "agreed" && d.stage !== "declined"
  );

  const closedWithViews = won.filter((d) => d.agreed_price && d.avg_views);
  const avgClosedCpm =
    closedWithViews.length > 0
      ? closedWithViews.reduce((s, d) => s + (d.agreed_price! / d.avg_views!) * 1000, 0) /
        closedWithViews.length
      : null;

  return {
    totalDeals: deals.length,
    activeDeals: active.length,
    wonDeals: won.length,
    totalSpend: won.reduce((s, d) => s + (d.agreed_price ?? 0), 0),
    avgClosedCpm,
    savedVsAsk: won.reduce(
      (s, d) => s + Math.max(0, (d.first_ask ?? 0) - (d.agreed_price ?? 0)),
      0
    ),
    lastDealAt: deals.map((d) => d.updated_at).sort().at(-1) ?? null,
  };
}
