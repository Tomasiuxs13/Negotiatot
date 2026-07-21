"use client";

import { useState, useTransition } from "react";
import type { ContentItem } from "@/lib/fulfillment-types";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { euroCpm } from "@/lib/format";
import { saveContentActualsAction } from "@/app/deals/[id]/fulfillment-actions";
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
}: {
  item: ContentItem;
  dealId: number;
  /** This item's share of the fee, for a per-item CPM readout. */
  sharePrice: number | null;
  windows: MeasurementWindows;
}) {
  const measurement = measurementState(item, windows);
  const [views, setViews] = useState(item.actual_views?.toString() ?? "");
  const [clicks, setClicks] = useState(item.actual_clicks?.toString() ?? "");
  const [orders, setOrders] = useState(item.actual_orders?.toString() ?? "");
  const [revenue, setRevenue] = useState(item.actual_revenue?.toString() ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const dirty =
    num(views) !== item.actual_views ||
    num(clicks) !== item.actual_clicks ||
    num(orders) !== item.actual_orders ||
    num(revenue) !== item.actual_revenue;

  const save = () =>
    startTransition(async () => {
      await saveContentActualsAction(item.id, dealId, {
        views: num(views),
        clicks: num(clicks),
        orders: num(orders),
        revenue: num(revenue),
      });
      setSaved(true);
    });

  const v = num(views);
  const cpm = v && v > 0 && sharePrice ? (sharePrice / v) * 1000 : null;
  const platform = item.platform as Platform | null;

  const field = (
    label: string,
    value: string,
    setter: (s: string) => void,
    placeholder: string
  ) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-slate-500">{label}</span>
      <input
        className={inputClass}
        type="number"
        min="0"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setter(e.target.value);
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
          <span className="ml-auto text-xs font-tabular text-slate-500">{euroCpm(cpm)} CPM</span>
        )}
      </div>

      <div className="flex items-end gap-3 flex-wrap">
        {field("Views", views, setViews, "88000")}
        {field("Clicks", clicks, setClicks, "1050")}
        {field("Orders", orders, setOrders, "34")}
        {field("Revenue €", revenue, setRevenue, "4080")}
        <button
          onClick={save}
          disabled={isPending || !dirty}
          className="text-xs font-medium rounded-md px-3 py-1.5 border border-slate-200 text-slate-700 hover:border-slate-400 transition-colors disabled:opacity-40"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {saved && !dirty && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
      </div>
    </div>
  );
}
