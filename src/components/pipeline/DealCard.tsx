import Link from "next/link";
import type { Deal } from "@/lib/types";
import { PLATFORM_META, dealPlatforms } from "@/lib/types";
import { euro } from "@/lib/format";

const AVATAR_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-orange-100 text-orange-700",
  "bg-rose-100 text-rose-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
];

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

const TONE_DOT: Record<string, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-400",
  neutral: "bg-slate-300",
};

function Row({ label, value, accent }: { label: string; value: string; accent?: "warn" | "good" }) {
  return (
    <div className="flex justify-between text-xs font-tabular">
      <span className="text-slate-500">{label}</span>
      <span
        className={`font-medium ${
          accent === "warn" ? "text-amber-600" : accent === "good" ? "text-emerald-600" : "text-slate-900"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function DealCard({ deal }: { deal: Deal }) {
  const platforms = dealPlatforms(deal);
  const yourMove = deal.your_move === 1;

  const rows: { label: string; value: string; accent?: "warn" | "good" }[] = [];
  if (deal.stage === "analyzing") {
    if (deal.current_ask != null) rows.push({ label: "Ask:", value: euro(deal.current_ask) });
    if (deal.target != null) rows.push({ label: "Est. value:", value: euro(deal.target) });
  } else if (deal.stage === "offer_sent") {
    if (deal.current_offer != null) rows.push({ label: "Our offer:", value: euro(deal.current_offer) });
    if (deal.current_ask != null) rows.push({ label: "Their ask:", value: euro(deal.current_ask) });
  } else if (deal.stage === "negotiating") {
    if (deal.current_ask != null) rows.push({ label: "Current ask:", value: euro(deal.current_ask) });
    if (deal.current_offer != null) rows.push({ label: "Our offer:", value: euro(deal.current_offer) });
    if (deal.current_ask != null && deal.current_offer != null)
      rows.push({ label: "Gap:", value: euro(deal.current_ask - deal.current_offer), accent: "warn" });
  } else if (deal.stage === "agreed") {
    if (deal.agreed_price != null) rows.push({ label: "Final:", value: euro(deal.agreed_price) });
    if (deal.first_ask != null && deal.agreed_price != null)
      rows.push({ label: "Saved:", value: euro(deal.first_ask - deal.agreed_price), accent: "good" });
  }

  return (
    <Link
      href={`/deals/${deal.id}`}
      draggable={false}
      className={`block bg-white rounded-lg p-4 shadow-sm relative group cursor-grab active:cursor-grabbing transition-shadow ${
        yourMove
          ? "border-2 border-brand hover:shadow-md"
          : "border border-slate-200 hover:border-slate-300"
      }`}
    >
      {yourMove && (
        <div className="absolute -top-2.5 right-3 bg-brand text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shadow-sm z-10">
          Your move
        </div>
      )}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${avatarColor(deal.creator)}`}
          >
            {deal.creator.charAt(0)}
          </div>
          <div>
            <h4 className="font-semibold text-sm text-slate-900 leading-tight">{deal.creator}</h4>
            <span className="text-xs text-slate-500 flex items-center gap-1.5">
              {platforms.map((p) => (
                <span key={p} className="flex items-center gap-0.5">
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                    {PLATFORM_META[p].icon}
                  </span>
                  {platforms.length > 1 ? "" : PLATFORM_META[p].label}
                </span>
              ))}
              {platforms.length > 1 && "Multi-platform"}
            </span>
          </div>
        </div>
        <span className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>more_horiz</span>
        </span>
      </div>

      {rows.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {rows.map((r) => (
            <Row key={r.label} {...r} />
          ))}
        </div>
      )}

      <div className="pt-3 border-t border-slate-100 flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${TONE_DOT[deal.status_tone]}`} />
        <span className="text-xs font-medium text-slate-600">{deal.status_label ?? "—"}</span>
      </div>
    </Link>
  );
}
