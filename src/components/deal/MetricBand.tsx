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

  return (
    // Six across only once there is real width for it. The engine's values are closer
    // to sentences than numbers — "9.11% overall / 10.65% video", "~87.5% (US 86.49% +
    // UK 1.00%)" — so at six columns on a 1280 screen each tile is ~147px and the value
    // wraps to four lines. Three up there reads far better than six cramped ones.
    <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-6 gap-4">
      {metrics.slice(0, 6).map((m) => {
        const icon = TONE_ICON[m.tone] ?? null;
        return (
          <div
            key={m.label}
            className="bg-white border border-slate-200 shadow-sm p-4 rounded-xl flex flex-col gap-1"
          >
            <span className="text-[11px] uppercase font-semibold tracking-wider text-slate-500">
              {m.label}
            </span>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold font-tabular tracking-tight text-slate-900 leading-tight">
                {m.value}
              </span>
              {icon && (
                <span
                  className={`material-symbols-outlined shrink-0 ${icon.className}`}
                  style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
                  aria-hidden
                />
              )}
            </div>
            {/* The note is the pass/fail reasoning and is often a full sentence — it
                wraps rather than truncating, since "fails by 2%" and "fails by 10x"
                are the same tone but very different decisions. */}
            <span className={`text-[11px] font-medium leading-snug ${TONE_NOTE[m.tone]}`}>
              {m.note}
            </span>
          </div>
        );
      })}
    </div>
  );
}
