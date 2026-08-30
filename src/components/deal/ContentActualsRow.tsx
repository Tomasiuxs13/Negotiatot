"use client";

import { useState, useTransition } from "react";
import type { ContentItem } from "@/lib/fulfillment-types";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { moneyCpm } from "@/lib/format";
import { saveContentActualsAction } from "@/app/deals/[id]/fulfillment-actions";
import { CAMPAIGN_KPIS, type CampaignKpi } from "@/lib/campaigns";
import {
  MEASUREMENT_LABEL,
  measurementState,
  type Measurement,
  type MeasurementState,
  type MeasurementWindows,
} from "@/lib/measurement";

const inputClass =
  "w-24 border border-slate-200 rounded-md bg-white px-2 py-1 text-sm text-right font-tabular text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/**
 * One deliverable's results. Editing per item is what lets a YouTube + TikTok deal
 * calibrate both platforms instead of collapsing into a single number.
 */
const BADGE: Record<MeasurementState, string> = {
  not_posted: "bg-slate-100 text-slate-500",
  maturing: "bg-sky-50 text-sky-700",
  due: "bg-amber-50 text-amber-700",
  provisional: "bg-amber-50 text-amber-700",
  final: "bg-emerald-50 text-emerald-700",
};

/** Says whether a number can be trusted yet, and when it can. */
function MeasurementBadge({ measurement }: { measurement: Measurement }) {
  const { state, matureOn, daysUntilMature } = measurement;
  const hint =
    state === "maturing"
      ? `Views still settling — final reading from ${matureOn} (${daysUntilMature} days)`
      : state === "provisional"
        ? `Read before ${matureOn}, so it doesn't count toward your benchmarks yet`
        : state === "due"
          ? "Past its window — this reading will count as final"
          : state === "final"
            ? "Settled: this calibrates your benchmarks"
            : "Not live yet";

  return (
    <span
      className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${BADGE[state]}`}
      title={hint}
    >
      {MEASUREMENT_LABEL[state]}
    </span>
  );
}

export default function ContentActualsRow({
  item,
  dealId,
  sharePrice,
  windows,
  primaryKpi = null,
}: {
  item: ContentItem;
  dealId: number;
  /** This item's share of the fee, for a per-item CPM readout. */
  sharePrice: number | null;
  windows: MeasurementWindows;
  primaryKpi?: CampaignKpi | null;
}) {
  const measurement = measurementState(item, windows);
  const [views, setViews] = useState(item.actual_views?.toString() ?? "");
  const [engagements, setEngagements] = useState(item.actual_engagements?.toString() ?? "");
  const [clicks, setClicks] = useState(item.actual_clicks?.toString() ?? "");
  const [orders, setOrders] = useState(item.actual_orders?.toString() ?? "");
  const [revenue, setRevenue] = useState(item.actual_revenue?.toString() ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    num(views) !== item.actual_views ||
    num(engagements) !== item.actual_engagements ||
    num(clicks) !== item.actual_clicks ||
    num(orders) !== item.actual_orders ||
    num(revenue) !== item.actual_revenue;

  const save = () =>
    startTransition(async () => {
      await saveContentActualsAction(item.id, dealId, {
        views: num(views),
        engagements: num(engagements),
        clicks: num(clicks),
        orders: num(orders),
        revenue: num(revenue),
      });
      setSaved(true);
    });

  const v = num(views);
  const cpm = v && v > 0 && sharePrice ? (sharePrice / v) * 1000 : null;
  const platform = item.platform as Platform | null;

  const values: Record<CampaignKpi, [string, (value: string) => void, string]> = {
    views: [views, setViews, "88000"],
    engagements: [engagements, setEngagements, "4200"],
    clicks: [clicks, setClicks, "1050"],
    orders: [orders, setOrders, "34"],
    revenue: [revenue, setRevenue, "4080"],
  };
  const focusKpi = primaryKpi ?? "views";
  const hasPrimaryKpi = primaryKpi != null;
  const visibleKpis = Array.from(new Set<CampaignKpi>([focusKpi, "views"]));
  const additionalKpis = (Object.keys(CAMPAIGN_KPIS) as CampaignKpi[]).filter(
    (key) => !visibleKpis.includes(key)
  );

  const field = (
    key: CampaignKpi,
    compact = false
  ) => (
    <label className="flex flex-col gap-1" title={key === "engagements" ? "Use the total interactions reported by the platform for this post." : undefined}>
      <span className={`text-[11px] ${hasPrimaryKpi && key === focusKpi ? "font-semibold text-brand-dark" : "text-slate-500"}`}>
        {CAMPAIGN_KPIS[key].shortLabel}{hasPrimaryKpi && key === focusKpi ? " · primary" : ""}
      </span>
      <input
        className={compact ? inputClass : `${inputClass} w-28`}
        type="number"
        min="0"
        step={key === "revenue" ? "0.01" : "1"}
        placeholder={values[key][2]}
        value={values[key][0]}
        onChange={(e) => {
          values[key][1](e.target.value);
          setSaved(false);
        }}
      />
    </label>
  );

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex items-center gap-2 mb-2.5">
        {platform && PLATFORM_META[platform] && (
          <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 15 }}>
            {PLATFORM_META[platform].icon}
          </span>
        )}
        <span className="text-sm font-medium text-slate-800">{item.title}</span>
        <MeasurementBadge measurement={measurement} />
        {cpm != null && (
          <span className="ml-auto text-xs font-tabular text-slate-500">{moneyCpm(cpm)} CPM</span>
        )}
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        {visibleKpis.map((key) => <div key={key}>{field(key)}</div>)}
        <button
          onClick={save}
          disabled={isPending || !dirty}
          className="text-xs font-medium rounded-md px-3 py-1.5 border border-slate-200 text-slate-700 hover:border-slate-400 transition-colors disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
      </div>
      <details className="group mt-2">
        <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 hover:text-slate-700 select-none flex items-center gap-1.5">
          <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
          Additional metrics
        </summary>
        <div className="flex items-end gap-3 flex-wrap mt-2">
          {additionalKpis.map((key) => <div key={key}>{field(key, true)}</div>)}
        </div>
      </details>
    </div>
  );
}
