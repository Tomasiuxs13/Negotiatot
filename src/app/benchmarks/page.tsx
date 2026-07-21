import PageHeader from "@/components/PageHeader";
import { getDeals, getExpectedReach } from "@/lib/db";
import { getAllContentItems } from "@/lib/fulfillment";
import { benchmarkRows, platformAverages } from "@/lib/benchmark-rows";
import { PLATFORM_META } from "@/lib/types";
import { euro, euroCpm, views as fmtViews } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function BenchmarksPage() {
  const deals = getDeals();
  // Bundle deals split into one row per platform, so a YouTube + TikTok deal
  // calibrates both baselines instead of inflating whichever came first.
  const rows = benchmarkRows(deals, getAllContentItems(), getExpectedReach());
  const calibrated = platformAverages(rows);

  return (
    <>
      <PageHeader
        title="Benchmarks"
        subtitle="Calibrated from your closed deals — predicted vs actual, and your real CPM by platform"
      />
      <main className="flex-1 overflow-y-auto p-8">
        {rows.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-slate-300 p-10 text-center max-w-2xl">
            <p className="text-sm font-medium text-slate-700 mb-1">No actuals logged yet</p>
            <p className="text-sm text-slate-500 max-w-md mx-auto">
              Close a deal, then open it and log post-campaign actuals (views, clicks, orders,
              revenue) in the Actuals tab. After a few deals, this page shows your real CPM by
              platform — so your fair-price model is built on your data, not generic industry numbers.
            </p>
          </div>
        ) : (
          <div className="space-y-6 max-w-5xl">
            {/* Calibrated cards */}
            <div className="grid grid-cols-3 gap-4">
              {calibrated.map((c) => (
                <div key={c.platform} className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="material-symbols-outlined text-slate-400" style={{ fontSize: 16 }}>
                      {PLATFORM_META[c.platform].icon}
                    </span>
                    <h3 className="font-headline text-sm font-semibold text-slate-900">
                      {PLATFORM_META[c.platform].label}
                    </h3>
                    <span className="ml-auto text-xs text-slate-400 font-tabular">{c.count} deals</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Your real avg CPM</span>
                      <span className="font-tabular font-semibold text-slate-900">{euroCpm(c.avgActualCpm)}</span>
                    </div>
                    {c.avgDelivery != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Delivery vs predicted</span>
                        <span
                          className={`font-tabular font-semibold ${
                            c.avgDelivery >= 1 ? "text-emerald-600" : "text-amber-600"
                          }`}
                        >
                          {Math.round(c.avgDelivery * 100)}%
                        </span>
                      </div>
                    )}
                    {c.avgRoas != null && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Avg ROAS</span>
                        <span className="font-tabular font-semibold text-slate-900">{c.avgRoas.toFixed(2)}×</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Per-deal table */}
            <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3 font-medium">Creator</th>
                    <th className="px-4 py-3 font-medium">Platform</th>
                    <th className="px-4 py-3 font-medium text-right">Paid</th>
                    <th className="px-4 py-3 font-medium text-right">Pred. views</th>
                    <th className="px-4 py-3 font-medium text-right">Actual views</th>
                    <th className="px-4 py-3 font-medium text-right">Pred. CPM</th>
                    <th className="px-4 py-3 font-medium text-right">Actual CPM</th>
                    <th className="px-4 py-3 font-medium text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={`${r.dealId}-${r.platform}`}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900">{r.creator}</td>
                      <td className="px-4 py-3 text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                            {PLATFORM_META[r.platform].icon}
                          </span>
                          <span className="text-xs">{PLATFORM_META[r.platform].label}</span>
                          {r.label && <span className="text-xs text-slate-400">· {r.label}</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-tabular">{euro(r.price)}</td>
                      <td className="px-4 py-3 text-right font-tabular text-slate-500">
                        {r.predictedViews != null ? fmtViews(r.predictedViews) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular">{fmtViews(r.actualViews)}</td>
                      <td className="px-4 py-3 text-right font-tabular text-slate-500">
                        {r.predictedCpm != null ? euroCpm(r.predictedCpm) : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-tabular font-semibold ${
                          r.predictedCpm != null
                            ? r.actualCpm <= r.predictedCpm
                              ? "text-emerald-600"
                              : "text-amber-600"
                            : "text-slate-900"
                        }`}
                      >
                        {euroCpm(r.actualCpm)}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular">
                        {r.roas != null ? `${r.roas.toFixed(2)}×` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500 max-w-[70ch]">
              Actual CPM in green means the deal delivered at or below what you predicted (you got
              equal or better reach per euro); amber means it under-delivered. As this table grows,
              the per-platform averages above become your calibrated fair-price baseline.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
