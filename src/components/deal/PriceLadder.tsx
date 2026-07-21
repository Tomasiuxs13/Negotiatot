import type { Deal } from "@/lib/types";
import { euro } from "@/lib/format";

interface Marker {
  value: number;
  label: string;
  side: "top" | "bottom";
  kind: "line" | "ask";
}

export default function PriceLadder({ deal }: { deal: Deal }) {
  const { anchor, target, walkaway, breakeven, current_ask } = deal;
  if (anchor == null || target == null || walkaway == null) return null;

  const values = [anchor, target, walkaway, breakeven, current_ask].filter(
    (v): v is number => v != null
  );
  const lo = Math.min(...values) * 0.94;
  const hi = Math.max(...values) * 1.04;
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;

  const markers: Marker[] = [
    { value: anchor, label: "our anchor", side: "bottom", kind: "line" },
    { value: target, label: "target", side: "top", kind: "line" },
    { value: walkaway, label: "walk-away", side: "bottom", kind: "line" },
  ];
  if (breakeven != null) markers.push({ value: breakeven, label: "breakeven", side: "bottom", kind: "line" });
  if (current_ask != null) markers.push({ value: current_ask, label: "their ask", side: "top", kind: "ask" });

  const greenW = pos(target);
  const amberW = pos(walkaway) - pos(target);

  return (
    <div className="relative h-20 mx-1 my-2" aria-label="Price ladder">
      {/* Track */}
      <div className="absolute top-8 left-0 right-0 h-2.5 rounded-full overflow-hidden flex">
        <div className="bg-emerald-500/80" style={{ width: `${greenW}%` }} />
        <div className="bg-amber-400/90" style={{ width: `${amberW}%` }} />
        <div className="bg-red-400/70 flex-1" />
      </div>

      {markers.map((m) => (
        <div
          key={m.label}
          className="absolute"
          style={{ left: `${pos(m.value)}%`, top: 0, bottom: 0 }}
        >
          {m.kind === "line" ? (
            <div className="absolute top-6 -translate-x-1/2 w-0.5 h-6 bg-slate-700 rounded" />
          ) : (
            <div className="absolute top-[26px] -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white shadow" />
          )}
          <div
            className={`absolute -translate-x-1/2 text-center whitespace-nowrap ${
              m.side === "top" ? "top-0" : "top-14"
            }`}
          >
            <div
              className={`text-[11px] font-semibold font-tabular ${
                m.kind === "ask" ? "text-red-600" : "text-slate-900"
              }`}
            >
              {euro(Math.round(m.value))}
            </div>
            <div
              className={`text-[10px] ${m.kind === "ask" ? "text-red-500 font-medium" : "text-slate-500"}`}
            >
              {m.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
