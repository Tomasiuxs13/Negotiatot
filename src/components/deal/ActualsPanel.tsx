"use client";

import { useState, useTransition } from "react";
import type { Deal } from "@/lib/types";
import { euro, euroCpm } from "@/lib/format";
import { saveActuals } from "@/app/deals/[id]/actions";

const inputClass =
  "w-full border border-slate-200 rounded-md bg-white px-2.5 py-1.5 text-sm text-right font-tabular text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand";

export default function ActualsPanel({ deal }: { deal: Deal }) {
  const price = deal.agreed_price ?? deal.current_offer;
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
  const predictedCpm =
    deal.avg_views && price ? (price / deal.avg_views) * 1000 : null;

  const fields: [string, string, (s: string) => void, string][] = [
    ["Actual views delivered", views, setViews, "e.g. 88000"],
    ["Clicks (from your link)", clicks, setClicks, "e.g. 1050"],
    ["Orders / conversions", orders, setOrders, "e.g. 34"],
    ["Revenue attributed (€)", revenue, setRevenue, "e.g. 4080"],
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
              {predictedCpm != null ? euroCpm(predictedCpm) : "—"}
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
              {actualCpm != null ? euroCpm(actualCpm) : "—"}
            </div>
          </div>
        </div>
      )}

      {price != null && (
        <p className="text-xs text-slate-400 mt-3">Paid {euro(price)} for this deal.</p>
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
