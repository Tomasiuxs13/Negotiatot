import Link from "next/link";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { needsAttention, type ContentRow } from "@/lib/content-queue";
import { blockingLabel } from "@/lib/fulfillment-types";
import {
  calendarEntries,
  isInMonth,
  monthGrid,
  monthLabel,
  shiftMonth,
  spacingConflicts,
  type CalendarEntry,
} from "@/lib/content-calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** How many chips fit in a day cell before it turns into a count. */
const MAX_PER_DAY = 3;

function Chip({
  entry,
  today,
  draftLeadDays,
}: {
  entry: CalendarEntry;
  today: string;
  draftLeadDays: number;
}) {
  const { row, kind } = entry;
  const meta = row.platform ? (PLATFORM_META[row.platform as Platform] ?? null) : null;
  const blocked = row.blockedBy.length > 0 && row.item.status !== "planned";
  const attention = needsAttention(row, today, draftLeadDays);
  const live = row.item.status === "posted" || row.item.status === "verified";

  // A draft deadline is a different kind of date from a publish slot — it is the one you
  // can still act on — so it is drawn as an outline rather than a filled chip.
  const style =
    kind === "draft"
      ? "border border-dashed border-slate-300 text-slate-500 bg-white"
      : blocked
        ? "bg-red-50 text-red-700 border border-red-200"
        : attention
          ? "bg-amber-50 text-amber-800 border border-amber-200"
          : live
            ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
            : "bg-slate-100 text-slate-700 border border-slate-200";

  return (
    <Link
      href={`/deals/${row.dealId}?tab=fulfillment`}
      title={`${row.creator} — ${row.item.title}${kind === "draft" ? " (draft due)" : ""}${
        blocked ? ` · blocked: ${blockingLabel(row.blockedBy)}` : ""
      }`}
      className={`flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight truncate hover:brightness-95 ${style}`}
    >
      {meta && (
        <span className="material-symbols-outlined shrink-0" style={{ fontSize: 10 }}>
          {meta.icon}
        </span>
      )}
      <span className="truncate">
        {kind === "draft" ? "draft · " : ""}
        {row.creator}
      </span>
    </Link>
  );
}

/**
 * The month view. Two things live here that the board cannot show: when work actually
 * lands, and whether any of it collides — two videos from the same creator days apart
 * read to an audience as one, and that is only visible against a calendar.
 */
export default function ContentCalendar({
  rows,
  month,
  today,
  draftLeadDays,
  minGapDays,
  hrefFor,
}: {
  rows: ContentRow[];
  month: string;
  today: string;
  draftLeadDays: number;
  minGapDays: number;
  hrefFor: (changes: Record<string, string>) => string;
}) {
  const entries = calendarEntries(rows, draftLeadDays);
  const grid = monthGrid(month);
  // Conflicts are computed across everything, not just this month — a clash that
  // straddles month end is exactly the one you would otherwise page past.
  const conflicts = spacingConflicts(rows, minGapDays);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Link
            href={hrefFor({ month: shiftMonth(month, -1) })}
            aria-label="Previous month"
            className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-slate-300"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              chevron_left
            </span>
          </Link>
          <h3 className="font-headline text-sm font-semibold text-slate-900 w-36 text-center">
            {monthLabel(month)}
          </h3>
          <Link
            href={hrefFor({ month: shiftMonth(month, 1) })}
            aria-label="Next month"
            className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:border-slate-300"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              chevron_right
            </span>
          </Link>
          <Link
            href={hrefFor({ month: today.slice(0, 7) })}
            className="ml-1 text-xs font-medium text-brand-dark hover:underline"
          >
            Today
          </Link>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm border border-dashed border-slate-300 bg-white" />
            draft due
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-200" />
            publishes
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm bg-emerald-50 border border-emerald-100" />
            live
          </span>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-900 mb-1.5">
            {conflicts.length} spacing clash{conflicts.length === 1 ? "" : "es"}
          </p>
          <ul className="space-y-1">
            {conflicts.map((c) => (
              <li key={`${c.creator}-${c.firstDay}`} className="text-xs text-amber-800">
                <Link
                  href={`/deals/${c.items[0].dealId}?tab=fulfillment`}
                  className="hover:underline"
                >
                  <span className="font-medium">{c.creator}</span> — {c.items.length} posts{" "}
                  {c.tightestGapDays === 0 && c.firstDay === c.lastDay
                    ? `all on ${c.firstDay}`
                    : `between ${c.firstDay} and ${c.lastDay}, closest ${c.tightestGapDays} day${
                        c.tightestGapDays === 1 ? "" : "s"
                      } apart`}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {entries.size === 0 && (
        <p className="text-xs text-slate-500">
          Nothing dated yet — set publish dates on the board and they appear here.
        </p>
      )}

      <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-[11px] font-medium text-slate-500 uppercase tracking-wider text-center"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {grid.flat().map((day) => {
            const dayEntries = entries.get(day) ?? [];
            const outside = !isInMonth(day, month);
            const isToday = day === today;
            const shown = dayEntries.slice(0, MAX_PER_DAY);
            const hidden = dayEntries.length - shown.length;
            return (
              <div
                key={day}
                className={`min-h-24 border-r border-b border-slate-100 p-1 ${
                  outside ? "bg-slate-50/60" : "bg-white"
                }`}
              >
                <div
                  className={`text-[11px] font-tabular mb-1 px-1 ${
                    isToday
                      ? "inline-flex items-center justify-center w-5 h-5 rounded-full bg-brand text-white font-semibold"
                      : outside
                        ? "text-slate-300"
                        : "text-slate-500"
                  }`}
                >
                  {Number(day.slice(8, 10))}
                </div>
                <div className="space-y-1">
                  {shown.map((entry) => (
                    <Chip
                      key={`${entry.row.item.id}-${entry.kind}`}
                      entry={entry}
                      today={today}
                      draftLeadDays={draftLeadDays}
                    />
                  ))}
                  {hidden > 0 && (
                    <p className="text-[10px] text-slate-400 px-1">+{hidden} more</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
