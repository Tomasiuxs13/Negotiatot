import type { Deal } from "@/lib/types";
import { money } from "@/lib/format";

/**
 * The four numbers a negotiation runs on, plus where the creator's ask currently sits.
 *
 * This replaces an earlier ladder that plotted every marker at its true position on a
 * value axis. That was honest about spacing but needed ~80px of vertical room and a wide
 * column to stop labels colliding, which is the opposite of what a header wants. Here the
 * figures read as a plain row and the track underneath carries the shape: green up to
 * target, amber to walk-away, red past it, with a line marking their current ask.
 */
export default function CockpitNumbers({ deal }: { deal: Deal }) {
  const { anchor, target, walkaway, breakeven, current_ask } = deal;
  if (anchor == null || target == null || walkaway == null) return null;

  const figures = [
    { label: "Anchor", value: anchor, className: "text-brand-dark" },
    { label: "Target", value: target, className: "text-emerald-600" },
    { label: "Walk-away", value: walkaway, className: "text-red-500" },
    ...(breakeven != null
      ? [{ label: "Breakeven", value: breakeven, className: "text-slate-500" }]
      : []),
  ];

  // Same axis the full ladder uses, so the ask's position agrees between the two.
  const values = [anchor, target, walkaway, breakeven, current_ask].filter(
    (v): v is number => v != null
  );
  const lo = Math.min(...values) * 0.94;
  const hi = Math.max(...values) * 1.04;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const greenW = pos(target);
  const amberW = pos(walkaway) - pos(target);

  return (
    <div className="flex flex-col gap-3 @container">
      {/* Two-up until the column is genuinely wide enough for four: at 1280 a quarter
          of this region is ~66px, where "Walk-away" wraps and drops its value a line
          below the other three, breaking the row they are meant to be read across. */}
      <div className={`grid gap-2 grid-cols-2 ${figures.length === 4 ? "@2xs:grid-cols-4" : "@2xs:grid-cols-3"}`}>
        {figures.map((f) => (
          <div key={f.label} className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase font-semibold tracking-wide text-slate-500 mb-1 whitespace-nowrap">
              {f.label}
            </span>
            <span className={`text-lg font-semibold font-tabular ${f.className}`}>
              {money(Math.round(f.value))}
            </span>
          </div>
        ))}
      </div>

      <div
        className="relative h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex"
        role="img"
        aria-label={`Anchor ${money(anchor)}, target ${money(target)}, walk-away ${money(walkaway)}${
          current_ask != null ? `, their ask ${money(current_ask)}` : ""
        }`}
      >
        <div className="h-full bg-emerald-500" style={{ width: `${greenW}%` }} />
        <div className="h-full bg-amber-400" style={{ width: `${amberW}%` }} />
        <div className="h-full bg-red-400 flex-1" />
        {current_ask != null && (
          <span
            className="absolute top-0 w-0.5 h-full bg-slate-900"
            style={{ left: `${pos(current_ask)}%` }}
          />
        )}
      </div>

      {current_ask != null && (
        <p className="text-[11px] text-slate-500">
          Their ask{" "}
          <span className="font-tabular font-semibold text-slate-900">
            {money(current_ask)}
          </span>
          {current_ask > walkaway ? (
            <span className="text-red-600 font-medium"> · past walk-away</span>
          ) : current_ask > target ? (
            <span className="text-amber-600 font-medium"> · above target</span>
          ) : (
            <span className="text-emerald-600 font-medium"> · within range</span>
          )}
        </p>
      )}
    </div>
  );
}
