"use client";

import Link from "next/link";
import type { Deal, Stage } from "@/lib/types";
import type { DealPhase } from "@/lib/deal-phase";
import { PLATFORM_META, STAGES, dealPlatforms } from "@/lib/types";
import { money, views as fmtViews } from "@/lib/format";

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

const PHASE_DOT: Record<string, string> = {
  neutral: "bg-slate-300",
  good: "bg-emerald-500",
  warn: "bg-amber-400",
};

export default function DealCard({
  deal,
  phase,
  moving = false,
  onMove,
}: {
  deal: Deal;
  phase?: DealPhase;
  moving?: boolean;
  onMove: (stage: Stage) => void;
}) {
  const platforms = dealPlatforms(deal);
  const yourMove = deal.your_move === 1;

  /**
   * One line of the figures that matter at THIS stage — no labels. Which numbers they
   * are is what the stage already tells you: an unpriced lead shows reach, a live
   * negotiation shows the two positions and the gap between them.
   */
  const facts: string[] = [];
  if (deal.stage === "lead" || deal.stage === "contacted") {
    if (deal.avg_views != null) facts.push(`${fmtViews(deal.avg_views)} views`);
    if (deal.current_ask != null) facts.push(`asks ${money(deal.current_ask)}`);
  } else if (deal.stage === "analyzing") {
    if (deal.current_ask != null) facts.push(`asks ${money(deal.current_ask)}`);
    if (deal.target != null) facts.push(`worth ${money(deal.target)}`);
  } else if (deal.stage === "offer_sent") {
    if (deal.current_offer != null) facts.push(`offered ${money(deal.current_offer)}`);
    if (deal.current_ask != null) facts.push(`asks ${money(deal.current_ask)}`);
  } else if (deal.stage === "negotiating") {
    if (deal.current_offer != null && deal.current_ask != null) {
      facts.push(`${money(deal.current_offer)} vs ${money(deal.current_ask)}`);
      facts.push(`gap ${money(deal.current_ask - deal.current_offer)}`);
    } else if (deal.current_ask != null) {
      facts.push(`asks ${money(deal.current_ask)}`);
    }
  } else if (deal.stage === "agreed" || deal.stage === "completed") {
    if (deal.agreed_price != null) facts.push(money(deal.agreed_price));
    if (deal.first_ask != null && deal.agreed_price != null && deal.first_ask > deal.agreed_price)
      facts.push(`saved ${money(deal.first_ask - deal.agreed_price)}`);
  }

  return (
    <article
      className={`bg-white rounded-lg relative group transition-colors border border-slate-200 hover:border-slate-300 hover:shadow-sm ${
        yourMove ? "border-l-2 border-l-brand" : ""
      }`}
    >
      <Link href={`/deals/${deal.id}`} draggable={false} className="block p-3 pb-2">
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${avatarColor(deal.creator)}`}
            >
              {deal.creator.charAt(0)}
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-[13px] text-slate-900 leading-tight truncate">
                {deal.creator}
              </h4>
              <span className="text-slate-400 flex items-center gap-1 mt-0.5">
                {platforms.map((p) => (
                  <span
                    key={p}
                    className="material-symbols-outlined"
                    style={{ fontSize: 13 }}
                    title={PLATFORM_META[p].label}
                  >
                    {PLATFORM_META[p].icon}
                  </span>
                ))}
              </span>
            </div>
          </div>
          {yourMove && (
            <span
              className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1"
              title="Your move — the Copilot's recommendation is ready"
            />
          )}
        </div>

        {facts.length > 0 && (
          <p className="font-data text-[11px] text-slate-600 mb-2">{facts.join(" · ")}</p>
        )}

        <div className="pt-2 border-t border-slate-100">
          {/* Once a deal is signed, where the work stands beats a status typed at signing. */}
          {phase && phase.key !== "nothing_tracked" ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`w-2 h-2 rounded-full ${PHASE_DOT[phase.tone]}`} />
              <span className="text-xs font-medium text-slate-700">{phase.label}</span>
              {phase.behind && (
                <span className="text-xs text-amber-600" title={phase.behind}>
                  · {phase.behind}
                </span>
              )}
            </div>
          ) : deal.status_label ? (
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${TONE_DOT[deal.status_tone]}`} />
              <span className="text-xs font-medium text-slate-600 truncate">{deal.status_label}</span>
            </div>
          ) : null}
        </div>
      </Link>

      <div
        className="border-t border-slate-100 px-3 py-2"
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      >
        <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-500">
          Move to
          <select
            aria-label={`Move ${deal.creator} to stage`}
            value={deal.stage}
            disabled={moving}
            onChange={(event) => onMove(event.target.value as Stage)}
            className="min-w-0 max-w-36 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 outline-none hover:border-slate-300 focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
          >
            {STAGES.map((stage) => (
              <option key={stage.key} value={stage.key}>
                {stage.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </article>
  );
}
