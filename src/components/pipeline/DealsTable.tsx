import Link from "next/link";
import type { Deal } from "@/lib/types";
import { PLATFORM_META, STAGE_LABELS, dealPlatforms } from "@/lib/types";
import { money } from "@/lib/format";
import { DEAL_STAGE_TONE, TONE_CLASS } from "@/lib/status-tones";
import type { DealPhase } from "@/lib/deal-phase";
import { SortHeader } from "@/components/FilterBar";
import { nextDir, type SortDir } from "@/lib/table-sort";



/** "3 days ago" — relative time reads faster than a date when scanning for staleness. */
function ago(timestamp: string): string {
  const then = new Date(timestamp.slice(0, 10) + "T00:00:00Z").getTime();
  const now = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  const days = Math.round((now - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

/**
 * The scan-everything view of the same deals the board shows. Carries the numbers and
 * last-activity the cards can't fit, so it earns its place next to the board.
 */
export default function DealsTable({
  deals,
  phases = {},
  sort = "",
  dir = "desc",
  hrefFor,
}: {
  deals: Deal[];
  phases?: Record<number, DealPhase>;
  sort?: string;
  dir?: SortDir;
  hrefFor?: (changes: Record<string, string>) => string;
}) {
  const sortable = (label: string, key: string, align: "left" | "right" = "left") =>
    hrefFor ? (
      <SortHeader
        label={label}
        align={align}
        active={sort === key}
        dir={dir}
        href={hrefFor({ sort: key, dir: nextDir(sort === key, dir) })}
      />
    ) : (
      <th className={`px-4 py-3 font-medium ${align === "right" ? "text-right" : "text-left"}`}>
        {label}
      </th>
    );
  if (deals.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-dashed border-slate-300 p-10 text-center">
        <p className="text-sm font-medium text-slate-700 mb-1">No deals match this view</p>
        <p className="text-sm text-slate-500">Try clearing the filters, or start a new deal.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
            {sortable("Creator", "creator")}
            <th className="px-4 py-3 font-medium">Platforms</th>
            <th className="px-4 py-3 font-medium">Stage</th>
            {sortable("Their ask", "ask", "right")}
            {sortable("Our number", "value", "right")}
            <th className="px-4 py-3 font-medium">Status</th>
            {sortable("Last activity", "updated", "right")}
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => (
            <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3">
                <Link href={`/deals/${d.id}`} className="font-medium text-slate-900 hover:text-brand">
                  {d.creator}
                </Link>
                {d.your_move === 1 && (
                  <span className="ml-2 text-[10px] font-semibold bg-amber-50 text-amber-700 rounded-full px-1.5 py-0.5">
                    your move
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-500">
                <span className="flex items-center gap-1.5">
                  {dealPlatforms(d).map((p) => (
                    <span
                      key={p}
                      className="material-symbols-outlined"
                      style={{ fontSize: 15 }}
                      title={PLATFORM_META[p].label}
                    >
                      {PLATFORM_META[p].icon}
                    </span>
                  ))}
                </span>
              </td>
              <td className="px-4 py-3">
                <span
                  className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE_CLASS[DEAL_STAGE_TONE[d.stage] ?? "neutral"]}`}
                >
                  {STAGE_LABELS[d.stage]}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-tabular text-slate-600">
                {d.current_ask ? money(d.current_ask) : "—"}
              </td>
              <td className="px-4 py-3 text-right font-tabular font-medium text-slate-900">
                {d.agreed_price ?? d.current_offer ? money(d.agreed_price ?? d.current_offer) : "—"}
              </td>
              <td className="px-4 py-3 text-slate-500 text-xs">
                {phases[d.id] && phases[d.id].key !== "nothing_tracked"
                  ? phases[d.id].label
                  : (d.status_label ?? "—")}
                {phases[d.id]?.behind && (
                  <span className="block text-amber-600">{phases[d.id].behind}</span>
                )}
                {d.decline_note && (
                  <span className="block text-slate-400 truncate max-w-56" title={d.decline_note}>
                    {d.decline_note}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-right text-xs text-slate-400 whitespace-nowrap">
                {ago(d.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
