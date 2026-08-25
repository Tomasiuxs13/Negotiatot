import { CONTENT_STATUS_FLOW, CONTENT_STATUS_LABEL } from "@/lib/fulfillment-types";
import { groupByStatus, type ContentRow } from "@/lib/content-queue";
import ContentCard from "./ContentCard";

/**
 * The six columns are the contract review loop, not an invented workflow: planned →
 * in production → submitted → approved → posted → verified.
 *
 * Deliberately not drag-and-drop. Statuses here are not interchangeable labels — a card
 * dropped straight into "verified" would skip the draft review and can release money
 * held against verification. Each card carries the one action that advances it correctly
 * instead, which is also what makes this a worklist rather than a status display.
 */
export default function ContentBoard({
  rows,
  today,
  draftLeadDays,
}: {
  rows: ContentRow[];
  today: string;
  draftLeadDays: number;
}) {
  const groups = groupByStatus(rows, today);

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] pb-4">
      {CONTENT_STATUS_FLOW.map((status) => {
        const column = groups[status];
        return (
          <div
            key={status}
            className="flex-1 min-w-56 flex flex-col rounded-xl p-2 border bg-slate-100/50 border-slate-200/60"
          >
            <div className="flex items-center gap-2 px-2 py-3 mb-2">
              <h3 className="label-caps text-slate-600">{CONTENT_STATUS_LABEL[status]}</h3>
              <span className="font-data text-xs text-slate-400">{column.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2.5 px-1 custom-scrollbar">
              {column.map((row) => (
                <ContentCard
                  key={row.item.id}
                  row={row}
                  today={today}
                  draftLeadDays={draftLeadDays}
                />
              ))}
              {column.length === 0 && (
                <div className="h-16 rounded-lg border border-dashed border-slate-200" />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
