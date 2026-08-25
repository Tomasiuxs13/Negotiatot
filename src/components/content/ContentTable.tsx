import Link from "next/link";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { CONTENT_STATUS_LABEL, blockingLabel } from "@/lib/fulfillment-types";
import { CONTENT_TONE, TONE_CLASS } from "@/lib/status-tones";
import { isOverdue } from "@/lib/fulfillment-rules";
import { SortHeader } from "@/components/FilterBar";
import { nextDir, type SortDir } from "@/lib/table-sort";
import {
  daysInStatus,
  leadDate,
  nextAction,
  type ContentRow,
} from "@/lib/content-queue";

/**
 * The scan-everything view of the same items the board shows. It carries the columns a
 * card has no room for — campaign, who is holding it up, how long it has been sitting —
 * which is what makes it worth having next to the board rather than instead of it.
 */
export default function ContentTable({
  rows,
  today,
  draftLeadDays,
  sort = "",
  dir = "asc",
  hrefFor,
}: {
  rows: ContentRow[];
  today: string;
  draftLeadDays: number;
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

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-dashed border-slate-300 p-10 text-center">
        <p className="text-sm font-medium text-slate-700 mb-1">No content matches this view</p>
        <p className="text-sm text-slate-500">
          Content items are created when you confirm a contract, or by hand on a deal.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-left label-caps text-slate-500 border-b border-slate-200">
            {sortable("Creator", "creator")}
            <th className="px-4 py-3 font-medium">Deliverable</th>
            <th className="px-4 py-3 font-medium">Platform</th>
            <th className="px-4 py-3 font-medium">Campaign</th>
            <th className="px-4 py-3 font-medium">Status</th>
            {sortable("Due", "due")}
            <th className="px-4 py-3 font-medium">Next</th>
            <th className="px-4 py-3 font-medium text-right">Waiting</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const item = row.item;
            const action = nextAction(row, today, draftLeadDays);
            const lead = leadDate(item, draftLeadDays);
            const overdue = isOverdue(item, today);
            const meta = row.platform ? (PLATFORM_META[row.platform as Platform] ?? null) : null;
            const waiting = daysInStatus(item, today);
            return (
              <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/deals/${row.dealId}?tab=fulfillment`}
                    className="font-medium text-slate-900 hover:text-brand"
                  >
                    {row.creator}
                  </Link>
                </td>
                {/* Flex, not a truncating cell: a long title must not be able to clip the
                    one marker on the row that says the result will never be measurable. */}
                <td className="px-4 py-3 text-slate-600 max-w-64">
                  <span className="flex items-center gap-2">
                    <span className="truncate" title={item.title}>
                      {item.title}
                    </span>
                    {row.blockedBy.length > 0 && (
                      <span
                        className="shrink-0 text-[10px] font-semibold bg-red-50 text-red-700 rounded-full px-1.5 py-0.5"
                        title={`Tracking setup missing: ${blockingLabel(row.blockedBy)}`}
                      >
                        untracked
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {meta ? (
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                        {meta.icon}
                      </span>
                      {meta.label}
                    </span>
                  ) : (
                    <span className="text-slate-300">not set</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{row.campaign ?? "—"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE_CLASS[CONTENT_TONE[item.status]]}`}
                  >
                    {CONTENT_STATUS_LABEL[item.status]}
                  </span>
                </td>
                <td
                  className={`px-4 py-3 text-xs font-data whitespace-nowrap ${
                    overdue ? "text-red-600 font-semibold" : "text-slate-500"
                  }`}
                >
                  {lead ? `${lead.label} ${lead.date}` : <span className="text-slate-300">no date</span>}
                  {overdue && " · overdue"}
                </td>
                <td className="px-4 py-3 text-xs whitespace-nowrap">
                  <span
                    className={
                      action.kind === "blocked"
                        ? "text-red-600 font-medium"
                        : action.owner === "us"
                          ? "text-brand-dark font-medium"
                          : "text-slate-500"
                    }
                  >
                    {action.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-xs text-slate-400 font-data whitespace-nowrap">
                  {waiting == null ? "—" : `${waiting}d`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
