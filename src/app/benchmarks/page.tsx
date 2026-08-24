import PageHeader from "@/components/PageHeader";
import { getDeals, getExpectedReach, getSetting } from "@/lib/db";
import type { MeasurementWindows } from "@/lib/measurement";
import { getAllContentItems } from "@/lib/fulfillment";
import { benchmarkRows, platformAverages } from "@/lib/benchmark-rows";
import { outcomes } from "@/lib/outcomes";
import { PLATFORM_META } from "@/lib/types";
import { money, moneyCpm, views as fmtViews } from "@/lib/format";
import { PAGE_WIDTH } from "@/lib/layout";

export const dynamic = "force-dynamic";

export default function BenchmarksPage() {
  const deals = getDeals();
  // Bundle deals split into one row per platform, so a YouTube + TikTok deal
  // calibrates both baselines instead of inflating whichever came first.
  const windows = getSetting<MeasurementWindows>("measurement_windows") ?? {};
  const rows = benchmarkRows(deals, getAllContentItems(), getExpectedReach(), windows);
  const calibrated = platformAverages(rows);
  const result = outcomes(deals);

  return (
    <>
      <PageHeader
        title="Benchmarks"
        subtitle="Calibrated from your closed deals — predicted vs actual, and your real CPM by platform"
      />
      <main className="flex-1 overflow-y-auto p-8">
        {result.lost + result.won > 0 && (
          <div className={`bg-white rounded-lg border border-slate-200 shadow-sm p-5 mb-6 ${PAGE_WIDTH}`}>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-headline text-sm font-semibold text-slate-900">Win rate</h3>
              <span className="text-xs text-slate-400">
                {result.open} still open
              </span>
            </div>
            <div className="flex items-baseline gap-6 flex-wrap">
              <div>
                <div className="text-2xl font-semibold font-tabular text-slate-900">
                  {result.winRate != null ? `${Math.round(result.winRate * 100)}%` : "—"}
                </div>
                <div className="text-xs text-slate-500">
                  {result.won} won · {result.lost} declined
                </div>
              </div>
              {result.reasons.length > 0 && (
                <div className="flex-1 min-w-64">
                  <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1.5">
                    Why deals died
                  </div>
                  <div className="space-y-1">
                    {result.reasons.map((r) => (
                      <div key={r.reason} className="flex items-baseline gap-2 text-sm">
                        <span className="text-slate-600">{r.label}</span>
                        <span className="flex-1 border-b border-dotted border-slate-200" />
                        <span className="font-tabular text-slate-900">{r.count}</span>
                        {r.value > 0 && (
                          <span className="font-tabular text-xs text-slate-400 w-20 text-right">
                            {money(r.value)} asked
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

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
          <div className={`space-y-6 ${PAGE_WIDTH}`}>
            {/* Calibrated cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      <span className="font-tabular font-semibold text-slate-900">{moneyCpm(c.avgActualCpm)}</span>
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
                        <span className="text-slate-500">Avg fee ROAS</span>
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
                    <th
                      className="px-4 py-3 font-medium text-right"
                      title="Attributed revenue divided by the creator fee allocated to this platform"
                    >
                      Fee ROAS
                    </th>
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
                          {!r.isFinal && (
                            <span
                              className="text-[10px] font-semibold bg-amber-50 text-amber-700 rounded-full px-1.5 py-0.5"
                              title="Measured before the platform's views had settled — shown here, but excluded from the averages above"
                            >
                              provisional
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-tabular">{money(r.price)}</td>
                      <td className="px-4 py-3 text-right font-tabular text-slate-500">
                        {r.predictedViews != null ? fmtViews(r.predictedViews) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-tabular">{fmtViews(r.actualViews)}</td>
                      <td className="px-4 py-3 text-right font-tabular text-slate-500">
                        {r.predictedCpm != null ? moneyCpm(r.predictedCpm) : "—"}
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
                        {moneyCpm(r.actualCpm)}
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
              equal or better reach per dollar); amber means it under-delivered. As this table grows,
              the per-platform averages above become your calibrated fair-price baseline. Fee ROAS
              uses only the creator fee; open a deal&apos;s Actuals tab for all-in ROAS including
              commission and gifted product cost.
              {rows.some((r) => !r.isFinal) && (
                <>
                  {" "}
                  Rows marked <span className="font-medium text-amber-700">provisional</span>{" "}
                  were read before that platform&apos;s views had settled — they&apos;re listed but
                  left out of the averages, so an early number can&apos;t drag your baseline down.
                </>
              )}
            </p>
          </div>
        )}
      </main>
    </>
  );
}
