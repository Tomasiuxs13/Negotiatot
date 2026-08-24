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
}: {
  deal: Deal;
  contentItems: ContentItem[];
  /** Channel averages per platform, keyed by platform — mirrors the benchmark split. */
  expectedReach?: Record<string, number>;
  windows?: MeasurementWindows;
  finance?: ActualsFinance;
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
      />
    );
  }
  return <DealLevelActuals deal={deal} price={price} finance={finance} />;
}

function PerItemActuals({
  deal,
  contentItems,
  price,
  expectedReach,
  windows,
  finance,
}: {
  deal: Deal;
  contentItems: ContentItem[];
  price: number | null;
  expectedReach: Record<string, number>;
  windows: MeasurementWindows;
  finance: ActualsFinance;
}) {
  const measured = contentItems.filter((c) => c.actual_views != null && c.actual_views > 0);
  const unattributed = measured.filter((c) => !c.platform).length;
  const totalViews = measured.reduce((s, c) => s + (c.actual_views ?? 0), 0);
  const hasRevenue = measured.some((c) => c.actual_revenue != null);
  const totalRevenue = measured.reduce((s, c) => s + (c.actual_revenue ?? 0), 0);
  const totalOrders = measured.reduce((s, c) => s + (c.actual_orders ?? 0), 0);
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
        Log what each deliverable returned.{" "}
        {multi
          ? "Because this deal spans platforms, per-item numbers let Counterpart calibrate each platform separately instead of crediting the whole deal to one of them."
          : "Counterpart compares predicted vs actual and calibrates your CPM benchmarks, so your fair-price model sharpens with every closed deal."}
      </p>
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
          />
        ))}
      </div>

      {totalViews > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total views", value: fmtViews(totalViews) },
              { label: "Orders", value: totalOrders > 0 ? String(totalOrders) : "—" },
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
}: {
  deal: Deal;
  price: number | null;
  finance: ActualsFinance;
}) {
  const [views, setViews] = useState(deal.actual_views?.toString() ?? "");
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

  const fields: [string, string, (s: string) => void, string][] = [
    ["Actual views delivered", views, setViews, "e.g. 88000"],
    ["Clicks (from your link)", clicks, setClicks, "e.g. 1050"],
    ["Orders / conversions", orders, setOrders, "e.g. 34"],
    ["Revenue attributed ($)", revenue, setRevenue, "e.g. 4080"],
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 max-w-xl">
      <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">
        Post-campaign actuals
      </h3>
      <p className="text-xs text-slate-500 mb-4 max-w-[60ch]">
        Once the deal runs, log what actually happened. Counterpart compares predicted vs actual and
        calibrates your CPM benchmarks — so your fair-price model gets sharper with every closed deal.
      </p>

      <div className="space-y-2.5">
        {fields.map(([label, val, setter, ph]) => (
          <div key={label} className="flex items-center justify-between gap-4">
            <span className="text-sm text-slate-600">{label}</span>
            <input
              className={inputClass + " w-32"}
              type="number"
              min="0"
              placeholder={ph}
              value={val}
              onChange={(e) => {
                setter(e.target.value);
                setSaved(false);
              }}
            />
          </div>
        ))}
      </div>

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
