import type { Deal, Platform } from "./types";
import { dealPlatforms } from "./types";
import type { ContentItem } from "./fulfillment-types";
import { countsTowardBenchmarks, measurementState, type MeasurementWindows } from "./measurement";

/** Typical reach per deliverable, keyed `partnerId:platform` — the creator's channel averages. */
export type ExpectedReach = Map<string, number>;

export const reachKey = (partnerId: number | null, platform: string) =>
  `${partnerId ?? "none"}:${platform}`;

/**
 * How much of a bundle's fee each platform carries.
 *
 * Allocating by *delivered* views would be circular — it forces every platform in the
 * deal to the same CPM, which is exactly the number we're trying to tell apart. So the
 * fee is allocated by what you expected to buy: the creator's typical reach on that
 * platform times the number of deliverables there. Actual CPM then shows whether the
 * platform delivered on the expectation you paid for.
 *
 * Without channel averages there's nothing to expect against, so it falls back to
 * delivered reach — the platforms share one CPM, but the views stay attributed.
 */
export function allocateFee(
  groups: { platform: Platform; itemCount: number; actualViews: number }[],
  expectedPerItem: (platform: Platform) => number | null
): Map<Platform, number> {
  const expected = groups.map((g) => {
    const per = expectedPerItem(g.platform);
    return per != null && per > 0 ? per * g.itemCount : null;
  });

  const weights = expected.every((e) => e != null)
    ? (expected as number[])
    : groups.map((g) => g.actualViews);

  const total = weights.reduce((a, b) => a + b, 0);
  const shares = new Map<Platform, number>();
  groups.forEach((g, i) => {
    shares.set(g.platform, total > 0 ? weights[i] / total : 1 / groups.length);
  });
  return shares;
}

export interface BenchmarkRow {
  dealId: number;
  creator: string;
  platform: Platform;
  /** The creator's managed category, when they have one. */
  category: string | null;
  /**
   * True when every reading behind this row was taken after the platform's window
   * closed. Provisional rows are shown but never averaged — one early number would
   * otherwise drag down the baseline every future deal is priced against.
   */
  isFinal: boolean;
  /** Portion of the fee attributed to this platform. */
  price: number;
  label: string | null;
  predictedViews: number | null;
  actualViews: number;
  predictedCpm: number | null;
  actualCpm: number;
  orders: number | null;
  revenue: number | null;
  roas: number | null;
}

const KNOWN: Platform[] = ["youtube", "instagram", "tiktok", "facebook"];

const isPlatform = (value: string | null): value is Platform =>
  value != null && (KNOWN as string[]).includes(value);

function sum(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length > 0 ? present.reduce((a, b) => a + b, 0) : null;
}

/**
 * Turns closed deals into per-platform benchmark rows.
 *
 * A bundle deal is the reason this exists: crediting a YouTube + TikTok deal entirely
 * to YouTube inflates one baseline and starves the other. When the deliverables carry
 * their own results we split the deal by platform, apportioning the fee by each
 * platform's share of delivered views — the fee bought the whole bundle, so the
 * platform that delivered more of the reach carries more of its cost.
 *
 * Deals without per-item numbers fall back to one row on the primary platform, which
 * is exactly how deal-level actuals behaved before.
 */
export function benchmarkRows(
  deals: Deal[],
  contentItems: ContentItem[],
  expectedReach: ExpectedReach = new Map(),
  windows: MeasurementWindows = {},
  today?: string,
  /** Creator category by partner id — what the per-category averages group on. */
  categories: Map<number, string | null> = new Map()
): BenchmarkRow[] {
  const rows: BenchmarkRow[] = [];

  for (const deal of deals) {
    const category = deal.partner_id != null ? (categories.get(deal.partner_id) ?? null) : null;
    const price = deal.agreed_price ?? deal.current_offer;
    if (price == null) continue;

    const platforms = dealPlatforms(deal);
    const measuredItems = contentItems.filter(
      (c) => c.deal_id === deal.id && c.actual_views != null && c.actual_views > 0
    );
    // A missing or foreign platform on a mixed deal is unresolved data, not permission
    // to credit the primary platform. Fulfillment exposes a repair control for it.
    const hasUnattributedMeasuredItem =
      platforms.length > 1 &&
      measuredItems.some((c) => !isPlatform(c.platform) || !platforms.includes(c.platform));
    const items = measuredItems.filter((c) =>
      platforms.length === 1
        ? !isPlatform(c.platform) || platforms.includes(c.platform)
        : isPlatform(c.platform) && platforms.includes(c.platform)
    );

    // Group this deal's measured deliverables by platform.
    const byPlatform = new Map<Platform, ContentItem[]>();
    for (const item of items) {
      const platform = isPlatform(item.platform) ? item.platform : platforms[0];
      const list = byPlatform.get(platform);
      if (list) list.push(item);
      else byPlatform.set(platform, [item]);
    }

    if (byPlatform.size > 0) {
      // While part of a deal is still unmeasured, the fee piles onto whichever platform
      // reported first — so nothing from this deal calibrates anything until the whole
      // deal is in.
      const dealFullyMeasured = !contentItems.some(
        (c) =>
          c.deal_id === deal.id &&
          (c.status === "posted" || c.status === "verified") &&
          (c.actual_views == null || c.actual_views <= 0)
      ) && !hasUnattributedMeasuredItem;

      const groups = [...byPlatform].map(([platform, group]) => ({
        platform,
        itemCount: group.length,
        actualViews: group.reduce((s, c) => s + (c.actual_views ?? 0), 0),
      }));
      const shares = allocateFee(groups, (p) =>
        expectedReach.get(reachKey(deal.partner_id, p)) ?? null
      );

      for (const [platform, group] of byPlatform) {
        const actualViews = group.reduce((s, c) => s + (c.actual_views ?? 0), 0);
        const platformPrice = price * (shares.get(platform) ?? 0);
        const revenue = sum(group.map((c) => c.actual_revenue));

        rows.push({
          dealId: deal.id,
          creator: deal.creator,
          platform,
          category,
          isFinal:
            dealFullyMeasured &&
            group.every((c) => countsTowardBenchmarks(measurementState(c, windows, today))),
          price: platformPrice,
          label: byPlatform.size > 1 ? `${group.length} item${group.length === 1 ? "" : "s"}` : null,
          // Predicted views are recorded per deal, not per platform, so only a
          // single-platform deal can be compared against them honestly.
          predictedViews: byPlatform.size === 1 ? deal.avg_views : null,
          actualViews,
          predictedCpm:
            byPlatform.size === 1 && deal.avg_views
              ? (price / deal.avg_views) * 1000
              : null,
          actualCpm: (platformPrice / actualViews) * 1000,
          orders: sum(group.map((c) => c.actual_orders)),
          revenue,
          roas: revenue != null && platformPrice > 0 ? revenue / platformPrice : null,
        });
      }
      continue;
    }

    // No per-item results — fall back to the deal's own totals.
    if (deal.actual_views == null || deal.actual_views <= 0) continue;
    rows.push({
      dealId: deal.id,
      creator: deal.creator,
      platform: platforms[0],
      category,
      // Deal-level totals predate per-item measurement; take them at face value.
      isFinal: true,
      price,
      label: platforms.length > 1 ? "deal total" : null,
      predictedViews: deal.avg_views,
      actualViews: deal.actual_views,
      predictedCpm: deal.avg_views ? (price / deal.avg_views) * 1000 : null,
      actualCpm: (price / deal.actual_views) * 1000,
      orders: deal.actual_orders,
      revenue: deal.actual_revenue,
      roas:
        deal.actual_revenue != null && price > 0 ? deal.actual_revenue / price : null,
    });
  }

  return rows;
}

/** Calibrated averages per platform, from real delivery. */
export function platformAverages(rows: BenchmarkRow[]) {
  return KNOWN.map((platform) => {
    const rs = rows.filter((r) => r.platform === platform && r.isFinal);
    if (rs.length === 0) return null;

    const withRoas = rs.filter((r) => r.roas != null);
    const withPredicted = rs.filter((r) => r.predictedViews != null);

    return {
      platform,
      count: rs.length,
      avgActualCpm: rs.reduce((s, r) => s + r.actualCpm, 0) / rs.length,
      avgRoas:
        withRoas.length > 0
          ? withRoas.reduce((s, r) => s + (r.roas ?? 0), 0) / withRoas.length
          : null,
      avgDelivery:
        withPredicted.length > 0
          ? withPredicted.reduce((s, r) => s + r.actualViews / r.predictedViews!, 0) /
            withPredicted.length
          : null,
    };
  }).filter((entry): entry is NonNullable<typeof entry> => entry != null);
}

/**
 * Calibrated averages per creator category, from real delivery.
 *
 * The platform average answers "what does YouTube cost us"; this answers "what does a
 * hunting channel cost us", which is the number that actually decides whether an ask is
 * fair. Same discipline as the platform version: only settled readings are averaged, and
 * a bucket says how thin it is so a single deal is never mistaken for a benchmark.
 */
export function categoryAverages(rows: BenchmarkRow[]) {
  const byCategory = new Map<string, BenchmarkRow[]>();
  for (const row of rows) {
    if (!row.isFinal || !row.category) continue;
    const list = byCategory.get(row.category);
    if (list) list.push(row);
    else byCategory.set(row.category, [row]);
  }

  return [...byCategory.entries()]
    .map(([category, rs]) => {
      const withRoas = rs.filter((r) => r.roas != null);
      const withPredicted = rs.filter((r) => r.predictedViews != null);
      return {
        category,
        count: rs.length,
        platforms: [...new Set(rs.map((r) => r.platform))],
        avgActualCpm: rs.reduce((s, r) => s + r.actualCpm, 0) / rs.length,
        avgRoas:
          withRoas.length > 0
            ? withRoas.reduce((s, r) => s + (r.roas ?? 0), 0) / withRoas.length
            : null,
        avgDelivery:
          withPredicted.length > 0
            ? withPredicted.reduce((s, r) => s + r.actualViews / r.predictedViews!, 0) /
              withPredicted.length
            : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
