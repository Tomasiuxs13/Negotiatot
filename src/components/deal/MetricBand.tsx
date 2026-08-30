import type { DealAnalysis } from "@/lib/types";

/**
 * The deal's fundamentals as a compact band across the full content width.
 *
 * These used to sit inside the Analysis tab's left column, where six tiles would have
 * had ~130px each — so they rendered two or three up and pushed the verdict prose far
 * down the page. They are also not really *analysis*: they are the facts the verdict
 * argues from, and they stay true whichever tab is open. At page level they get the
 * width to sit six across and stay visible while you work in Negotiation or Fulfilment.
 */

const TONE_ICON: Record<string, { icon: string; className: string } | null> = {
  good: { icon: "check_circle", className: "text-emerald-500" },
  warn: { icon: "warning", className: "text-amber-500" },
  crit: { icon: "error", className: "text-red-500" },
  neutral: null,
};

const TONE_NOTE: Record<string, string> = {
  good: "text-emerald-600",
  warn: "text-amber-600",
  crit: "text-red-600",
  neutral: "text-slate-400",
};

export default function MetricBand({ metrics }: { metrics: DealAnalysis["metrics"] }) {
  if (metrics.length === 0) return null;

  const visible = metrics.slice(0, 6);
  const issues = visible.filter((metric) => metric.tone === "warn" || metric.tone === "crit");

  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 md:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">Audience &amp; evidence</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                issues.length > 0
                  ? "bg-amber-100 text-amber-800"
                  : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {issues.length > 0
                ? `${issues.length} issue${issues.length === 1 ? "" : "s"}`
                : "Checks passed"}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {visible.length} source checks support this recommendation. Expand for values and reasons.
          </p>
        </div>
        <span
          className="material-symbols-outlined shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden
        >
          expand_more
        </span>
      </summary>

      {/* The engine's values can be sentence-length. They stay hidden until requested,
          so the verdict and next action remain above the fold on a normal laptop. */}
      <div className="grid grid-cols-1 gap-3 border-t border-slate-100 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {visible.map((m) => {
          const icon = TONE_ICON[m.tone] ?? null;
          return (
            <div key={m.label} className="flex flex-col gap-1 rounded-lg bg-slate-50 p-3">
              <span className="text-[11px] uppercase font-semibold tracking-wider text-slate-500">
                {m.label}
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-semibold font-tabular tracking-tight text-slate-900 leading-tight">
                  {m.value}
                </span>
                {icon && (
                  <span
                    className={`material-symbols-outlined shrink-0 ${icon.className}`}
                    style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
                    aria-hidden
                  >
                    {icon.icon}
                  </span>
                )}
              </div>
              <span className={`text-[11px] font-medium leading-snug ${TONE_NOTE[m.tone]}`}>
                {m.note}
              </span>
            </div>
          );
        })}
      </div>
    </details>
  );
}
