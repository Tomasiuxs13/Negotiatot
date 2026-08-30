"use client";

import { useState, useTransition } from "react";
import type { Deal } from "@/lib/types";
import { PLATFORM_META, dealPlatforms, type Platform } from "@/lib/types";
import type { ContentItem } from "@/lib/fulfillment-types";
import { money, moneyCpm, views as fmtViews } from "@/lib/format";
import { allocateFee } from "@/lib/benchmark-rows";
import type { MeasurementWindows } from "@/lib/measurement";
import { saveActuals } from "@/app/deals/[id]/actions";
import ContentActualsRow from "./ContentActualsRow";
import {
  CAMPAIGN_KPIS,
  objectiveLabel,
  type CampaignKpi,
  type CampaignObjective,
} from "@/lib/campaigns";
import {
  actualDealCost,
  returnOnAdSpend,
  type Commission,
  type CommissionTier,
  type Discount,
} from "@/lib/commission";

const inputClass =
  "w-full border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-right font-tabular text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

interface ActualsFinance {
  aov: number;
  commission: Commission;
  discount: Discount;
  commissionTiers: CommissionTier[];
  productCost: number;
}

const EMPTY_FINANCE: ActualsFinance = {
  aov: 0,
  commission: { type: "none", value: 0 },
  discount: { type: "none", value: 0 },
  commissionTiers: [],
  productCost: 0,
};

export interface CampaignGoal {
  objective: CampaignObjective | null;
  primaryKpi: CampaignKpi;
  target: number | null;
}

function formatKpi(key: CampaignKpi, value: number | null): string {
  if (value == null) return "—";
  return key === "revenue" ? money(value) : value.toLocaleString("en-US");
}

function GoalProgress({ goal, actual }: { goal: CampaignGoal; actual: number | null }) {
  const objective = objectiveLabel(goal.objective);
  const progress = goal.target && actual != null ? Math.min(100, (actual / goal.target) * 100) : null;
  return (
    <div className="mb-4 rounded-lg border border-violet-200 bg-violet-50/70 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-violet-700">
          {objective ?? "Campaign"} goal
        </span>
        <span className="text-sm font-semibold text-slate-900">
          {CAMPAIGN_KPIS[goal.primaryKpi].label}: {formatKpi(goal.primaryKpi, actual)}
          {goal.target != null ? ` / ${formatKpi(goal.primaryKpi, goal.target)}` : ""}
        </span>
      </div>
      {progress != null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-violet-100">
          <div className="h-full rounded-full bg-violet-500" style={{ width: `${progress}%` }} />
        </div>
      )}
      <p className="text-[11px] text-violet-700/80 mt-1">
        This is the primary success measure. Additional diagnostics stay available below.
      </p>
    </div>
  );
}

function actualCost(
  fee: number,
  orders: number,
  revenue: number | null,
  finance: ActualsFinance
) {
  return actualDealCost({
    fee,
    actualOrders: orders,
    actualRevenue: revenue,
    aov: finance.aov,
    commission: finance.commission,
    discount: finance.discount,
    tiers: finance.commissionTiers,
    productCost: finance.productCost,
  });
}

export default function ActualsPanel({
  deal,
  contentItems,
  expectedReach,
  windows,
  finance = EMPTY_FINANCE,
  goal = null,
}: {
  deal: Deal;
  contentItems: ContentItem[];
  /** Channel averages per platform, keyed by platform — mirrors the benchmark split. */
  expectedReach?: Record<string, number>;
  windows?: MeasurementWindows;
  finance?: ActualsFinance;
  goal?: CampaignGoal | null;
}) {
  const price = deal.agreed_price ?? deal.current_offer;

  // Per-deliverable logging is the accurate path; the deal-level form stays as a
  // fallback for deals that never got content items (no contract was parsed).
  if (contentItems.length > 0) {
    return (
      <PerItemActuals
        deal={deal}
        contentItems={contentItems}
        price={price}
        expectedReach={expectedReach ?? {}}
        windows={windows ?? {}}
        finance={finance}
        goal={goal}
      />
    );
  }
  return <DealLevelActuals deal={deal} price={price} finance={finance} goal={goal} />;
}

function PerItemActuals({
  deal,
  contentItems,
  price,
  expectedReach,
  windows,
  finance,
  goal,
}: {
  deal: Deal;
  contentItems: ContentItem[];
  price: number | null;
  expectedReach: Record<string, number>;
  windows: MeasurementWindows;
  finance: ActualsFinance;
  goal: CampaignGoal | null;
}) {
  const measured = contentItems.filter((item) =>
    [item.actual_views, item.actual_engagements, item.actual_clicks, item.actual_orders, item.actual_revenue]
      .some((value) => value != null)
  );
  const unattributed = measured.filter((c) => !c.platform).length;
  const totalViews = measured.reduce((s, c) => s + (c.actual_views ?? 0), 0);
  const totalEngagements = measured.reduce((s, c) => s + (c.actual_engagements ?? 0), 0);
  const totalClicks = measured.reduce((s, c) => s + (c.actual_clicks ?? 0), 0);
  const hasRevenue = measured.some((c) => c.actual_revenue != null);
  const totalRevenue = measured.reduce((s, c) => s + (c.actual_revenue ?? 0), 0);
  const totalOrders = measured.reduce((s, c) => s + (c.actual_orders ?? 0), 0);
  const totals: Record<CampaignKpi, number> = {
    views: totalViews,
    engagements: totalEngagements,
    clicks: totalClicks,
    orders: totalOrders,
    revenue: totalRevenue,
  };
  const primaryActual = goal
    ? measured.some((item) => item[`actual_${goal.primaryKpi}` as keyof ContentItem] != null)
      ? totals[goal.primaryKpi]
      : null
    : null;
  const cost = actualCost(price ?? 0, totalOrders, hasRevenue ? totalRevenue : null, finance);
  const feeRoas = returnOnAdSpend(totalRevenue, price ?? 0);
  const allInRoas = returnOnAdSpend(totalRevenue, cost.total);

  const platforms = dealPlatforms(deal);
  const multi = platforms.length > 1;

  // The exact rule the benchmarks use, so the two never tell different stories.
  const groups = platforms
    .map((p) => {
      const group = measured.filter((c) => c.platform === p);
      return group.length > 0
        ? {
            platform: p,
            itemCount: group.length,
            actualViews: group.reduce((s, c) => s + (c.actual_views ?? 0), 0),
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const shares = allocateFee(groups, (p) => expectedReach[p] ?? null);

  const feeOf = (platform: Platform) =>
    price != null ? price * (shares.get(platform) ?? 0) : null;

  /** An item's slice of its platform's fee, split by that item's share of the platform's views. */
  const shareOf = (item: ContentItem) => {
    if (!item.platform) return null;
    const platform = item.platform as Platform;
    const group = groups.find((g) => g.platform === platform);
    const fee = feeOf(platform);
    if (!group || fee == null || !item.actual_views || group.actualViews === 0) return null;
    return fee * (item.actual_views / group.actualViews);
  };

  const byPlatform = groups.map((g) => {
    const fee = feeOf(g.platform);
    return {
      platform: g.platform,
      views: g.actualViews,
      share: fee,
      cpm: fee != null && g.actualViews > 0 ? (fee / g.actualViews) * 1000 : null,
    };
  });

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 max-w-2xl">
      <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">
        Post-campaign actuals
      </h3>
      <p className="text-xs text-slate-500 mb-4 max-w-[65ch]">
        {goal
          ? "Log the campaign's primary KPI first, then add diagnostics when they help explain the result. "
          : "Log views for each deliverable, then add other results when they are available. "}
        {multi
          ? "Because this deal spans platforms, per-item numbers let Counterpart calibrate each platform separately instead of crediting the whole deal to one of them."
          : "Counterpart compares predicted vs actual and calibrates your CPM benchmarks, so your fair-price model sharpens with every closed deal."}
      </p>
      {goal && <GoalProgress goal={goal} actual={primaryActual} />}
      {unattributed > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-3">
          {unattributed} measured item{unattributed === 1 ? " is" : "s are"} excluded from
          platform CPMs until its platform is assigned in Fulfillment.
        </p>
      )}

      <div className="space-y-2.5">
        {contentItems.map((item) => (
          <ContentActualsRow
            key={item.id}
            item={item}
            dealId={deal.id}
            sharePrice={shareOf(item)}
            windows={windows}
            primaryKpi={goal?.primaryKpi}
          />
        ))}
      </div>

      {totalViews > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ...(goal ? [{
                label: `${CAMPAIGN_KPIS[goal.primaryKpi].shortLabel} · primary`,
                value: formatKpi(goal.primaryKpi, primaryActual),
              }] : []),
              ...(goal?.primaryKpi === "views" ? [] : [{ label: "Total views", value: totalViews > 0 ? fmtViews(totalViews) : "—" }]),
              {
                label: "Fee ROAS",
                value: feeRoas != null ? `${feeRoas.toFixed(2)}×` : "—",
              },
              {
                label: "All-in ROAS",
                value: allInRoas != null ? `${allInRoas.toFixed(2)}×` : "—",
              },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <div className="text-[11px] text-slate-500 uppercase tracking-wider">{s.label}</div>
                <div className="font-tabular font-semibold text-slate-900">{s.value}</div>
              </div>
            ))}
          </div>
          {(feeRoas != null || allInRoas != null) && (
            <p className="text-[11px] text-slate-500 mt-2">
              Fee ROAS uses the creator fee only. All-in ROAS also includes actual commission
              and any gifted product cost.
            </p>
          )}

          {multi && byPlatform.length > 1 && (
            <div className="mt-3">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">
                Split by platform
              </div>
              <div className="space-y-1">
                {byPlatform.map((b) => (
                  <div key={b.platform} className="flex items-center gap-2 text-sm">
                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 15 }}>
                      {PLATFORM_META[b.platform as Platform].icon}
                    </span>
                    <span className="text-slate-600">{PLATFORM_META[b.platform as Platform].label}</span>
                    <span className="text-slate-400 font-tabular text-xs">
                      {fmtViews(b.views)} views
                    </span>
                    <span className="ml-auto font-tabular text-slate-500 text-xs">
                      {b.share != null ? money(b.share) : "—"}
                    </span>
                    <span className="font-tabular font-semibold text-slate-900 w-20 text-right">
                      {b.cpm != null ? moneyCpm(b.cpm) : "—"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                The {price != null ? money(price) : "fee"} is split by the reach you expected from
                each platform, so a platform that over-delivers shows the lower CPM it earned.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DealLevelActuals({
  deal,
  price,
  finance,
  goal,
}: {
  deal: Deal;
  price: number | null;
  finance: ActualsFinance;
  goal: CampaignGoal | null;
}) {
  const [views, setViews] = useState(deal.actual_views?.toString() ?? "");
  const [engagements, setEngagements] = useState(deal.actual_engagements?.toString() ?? "");
  const [clicks, setClicks] = useState(deal.actual_clicks?.toString() ?? "");
  const [orders, setOrders] = useState(deal.actual_orders?.toString() ?? "");
  const [revenue, setRevenue] = useState(deal.actual_revenue?.toString() ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await saveActuals(deal.id, {
        views: num(views),
        engagements: num(engagements),
        clicks: num(clicks),
        orders: num(orders),
        revenue: num(revenue),
      });
      setSaved(true);
    });
  };

  const v = num(views);
  const actualCpm = v && price ? (price / v) * 1000 : null;
  const predictedCpm = deal.avg_views && price ? (price / deal.avg_views) * 1000 : null;
  const actualOrders = num(orders) ?? 0;
  const actualRevenueValue = num(revenue);
  const actualRevenue = actualRevenueValue ?? 0;
  const cost = actualCost(price ?? 0, actualOrders, actualRevenueValue, finance);
  const feeRoas = returnOnAdSpend(actualRevenue, price ?? 0);
  const allInRoas = returnOnAdSpend(actualRevenue, cost.total);

  const values: Record<CampaignKpi, [string, (value: string) => void, string]> = {
    views: [views, setViews, "e.g. 88000"],
    engagements: [engagements, setEngagements, "e.g. 4200"],
    clicks: [clicks, setClicks, "e.g. 1050"],
    orders: [orders, setOrders, "e.g. 34"],
    revenue: [revenue, setRevenue, "e.g. 4080"],
  };
  const focusKpi = goal?.primaryKpi ?? "views";
  const hasPrimaryKpi = goal != null;
  const visibleKpis = Array.from(new Set<CampaignKpi>([focusKpi, "views"]));
  const additionalKpis = (Object.keys(CAMPAIGN_KPIS) as CampaignKpi[]).filter(
    (key) => !visibleKpis.includes(key)
  );
  const primaryActual = num(values[focusKpi][0]);

  const field = (key: CampaignKpi) => (
    <div key={key} className="flex items-center justify-between gap-4">
      <span className={`text-sm ${hasPrimaryKpi && key === focusKpi ? "font-semibold text-brand-dark" : "text-slate-600"}`}>
        {CAMPAIGN_KPIS[key].label}{hasPrimaryKpi && key === focusKpi ? " · primary" : ""}
      </span>
      <input
        className={inputClass + " w-32"}
        type="number"
        min="0"
        step={key === "revenue" ? "0.01" : "1"}
        placeholder={values[key][2]}
        value={values[key][0]}
        title={key === "engagements" ? "Use the total interactions reported by the platform." : undefined}
        onChange={(e) => {
          values[key][1](e.target.value);
          setSaved(false);
        }}
      />
    </div>
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 max-w-xl">
      <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">
        Post-campaign actuals
      </h3>
      <p className="text-xs text-slate-500 mb-4 max-w-[60ch]">
        {goal
          ? "Record the primary campaign result first. Views remain visible because they calibrate your creator pricing benchmark; other diagnostic metrics are optional."
          : "Record delivered views to calibrate creator pricing. Other result metrics are optional."}
      </p>
      {goal && <GoalProgress goal={goal} actual={primaryActual} />}

      <div className="space-y-2.5">
        {visibleKpis.map(field)}
      </div>
      <details className="group mt-3 border-t border-slate-100 pt-3">
        <summary className="cursor-pointer list-none text-xs font-medium text-slate-500 hover:text-slate-700 select-none flex items-center gap-1.5">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
          Additional metrics
        </summary>
        <div className="space-y-2.5 mt-3">{additionalKpis.map(field)}</div>
      </details>

      {(actualCpm != null || predictedCpm != null) && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider">Predicted CPM</div>
            <div className="font-tabular font-semibold text-slate-900">
              {predictedCpm != null ? moneyCpm(predictedCpm) : "—"}
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <div className="text-[11px] text-slate-500 uppercase tracking-wider">Actual CPM</div>
            <div
              className={`font-tabular font-semibold ${
                actualCpm != null && predictedCpm != null
                  ? actualCpm <= predictedCpm
                    ? "text-emerald-600"
                    : "text-amber-600"
                  : "text-slate-900"
              }`}
            >
              {actualCpm != null ? moneyCpm(actualCpm) : "—"}
            </div>
          </div>
        </div>
      )}

      {(feeRoas != null || allInRoas != null) && (
        <div className="mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">Fee ROAS</div>
              <div className="font-tabular font-semibold text-slate-900">
                {feeRoas != null ? `${feeRoas.toFixed(2)}×` : "—"}
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <div className="text-[11px] text-slate-500 uppercase tracking-wider">All-in ROAS</div>
              <div className="font-tabular font-semibold text-slate-900">
                {allInRoas != null ? `${allInRoas.toFixed(2)}×` : "—"}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">
            Fee ROAS uses the creator fee only. All-in ROAS also includes actual commission
            and any gifted product cost.
          </p>
        </div>
      )}

      {price != null && (
        <p className="text-xs text-slate-400 mt-3">Paid {money(price)} for this deal.</p>
      )}

      <div className="flex items-center gap-3 mt-4">
        <button
          onClick={save}
          disabled={isPending}
          className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors shadow-sm disabled:opacity-60"
        >
          {isPending ? "Saving…" : "Save actuals"}
        </button>
        {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
        {deal.actuals_logged_at && !saved && (
          <span className="text-xs text-slate-400">
            Last logged {new Date(deal.actuals_logged_at).toLocaleDateString("en")}
          </span>
        )}
      </div>
    </div>
  );
}
