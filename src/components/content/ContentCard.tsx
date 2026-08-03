"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { isOverdue } from "@/lib/fulfillment-rules";
import {
  daysInStatus,
  leadDate,
  needsAttention,
  nextAction,
  REVIEW_SLA_DAYS,
  type ContentRow,
} from "@/lib/content-queue";
import { setContentDueDateAction, setContentStatusAction } from "@/app/content/actions";

/** Who is holding the item up, said plainly. The colour is the whole message. */
const OWNER_STYLE: Record<"us" | "creator", string> = {
  us: "bg-brand/10 text-brand-dark",
  creator: "bg-slate-100 text-slate-500",
};

function platformMeta(platform: string | null) {
  if (!platform) return null;
  return PLATFORM_META[platform as Platform] ?? null;
}

export default function ContentCard({
  row,
  today,
  draftLeadDays,
}: {
  row: ContentRow;
  today: string;
  draftLeadDays: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [dateDraft, setDateDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const item = row.item;
  const action = nextAction(row, today, draftLeadDays);
  const attention = needsAttention(row, today, draftLeadDays);
  const overdue = isOverdue(item, today);
  const lead = leadDate(item, draftLeadDays);
  const meta = platformMeta(row.platform);
  const waiting = daysInStatus(item, today);
  const dealHref = `/deals/${row.dealId}?tab=fulfillment`;

  // Only worth saying when the wait is the story: a draft we have not looked at, or a
  // posted video whose numbers are now old enough to read.
  const stalled =
    item.status === "submitted" && waiting != null && waiting >= REVIEW_SLA_DAYS
      ? `${waiting}d unreviewed`
      : null;

  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      setError(r?.error ?? null);
    });

  return (
    <div
      className={`bg-white rounded-lg p-3 shadow-sm border transition-shadow hover:shadow-md ${
        action.kind === "blocked"
          ? "border-red-300"
          : attention
            ? "border-amber-300"
            : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={dealHref}
          className="min-w-0 flex-1 group"
          title={`${row.creator} — ${item.title}`}
        >
          <p className="text-xs font-semibold text-slate-900 truncate group-hover:text-brand-dark">
            {row.creator}
          </p>
          <p className="text-xs text-slate-500 truncate">{item.title}</p>
        </Link>
        {meta ? (
          <span
            className="material-symbols-outlined text-slate-400 shrink-0"
            style={{ fontSize: 15 }}
            title={meta.label}
          >
            {meta.icon}
          </span>
        ) : (
          // A blank here is a real gap, not a styling choice — it is why this item is
          // missing from every platform filter on the page.
          <span
            className="material-symbols-outlined text-slate-300 shrink-0"
            style={{ fontSize: 15 }}
            title="No platform set — this item is invisible to the platform filters"
          >
            help
          </span>
        )}
      </div>

      {/* Once it is live the missing link is no longer a task — but it still explains why
          the numbers will never arrive, so it stays visible rather than disappearing. */}
      {action.kind !== "blocked" && row.blockedBy.length > 0 && (
        <p
          className="mt-2 text-[11px] text-red-600 font-medium truncate"
          title={row.blockedBy.join(", ")}
        >
          untracked · {row.blockedBy.join(" and ").toLowerCase()}
        </p>
      )}

      {(lead || (item.revision_round ?? 0) > 1) && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {lead && (
            <span
              className={`text-[11px] font-tabular ${
                overdue ? "text-red-600 font-semibold" : "text-slate-500"
              }`}
            >
              {lead.label} {lead.date}
              {overdue && " · overdue"}
            </span>
          )}
          {(item.revision_round ?? 0) > 1 && (
            <span className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 font-medium">
              rev {item.revision_round}
            </span>
          )}
          {stalled && (
            <span className="text-[11px] text-red-600 font-medium font-tabular">{stalled}</span>
          )}
        </div>
      )}

      <div className="mt-2.5 pt-2.5 border-t border-slate-100">
        {action.kind === "set_date" ? (
          // Done inline: sending someone to the deal page to type one date is how the
          // date never gets typed.
          <div className="flex items-center gap-1.5">
            <input
              type="date"
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
              aria-label={`Publish date for ${item.title}`}
              className="border border-slate-200 rounded px-1.5 py-1 text-[11px] text-slate-700 flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-brand/40"
            />
            <button
              onClick={() => dateDraft && run(() => setContentDueDateAction(item.id, row.dealId, dateDraft))}
              disabled={isPending || !dateDraft}
              className="text-[11px] font-semibold text-white bg-brand hover:bg-brand-dark rounded px-2 py-1 disabled:opacity-40"
            >
              Set
            </button>
          </div>
        ) : action.kind === "await_post" ? (
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11px] font-medium rounded px-1.5 py-0.5 ${OWNER_STYLE.creator}`}>
              {action.label}
            </span>
            <button
              onClick={() => run(() => setContentStatusAction(item.id, row.dealId, "posted"))}
              disabled={isPending}
              className="text-[11px] font-semibold text-brand-dark hover:underline disabled:opacity-40"
            >
              Mark posted
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-[11px] font-medium rounded px-1.5 py-0.5 ${
                action.kind === "blocked"
                  ? "bg-red-50 text-red-700"
                  : action.owner
                    ? OWNER_STYLE[action.owner]
                    : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {action.label}
            </span>
            {action.owner === "us" && (
              <Link href={dealHref} className="text-[11px] font-semibold text-brand-dark hover:underline">
                Open →
              </Link>
            )}
            {action.kind === "chase_draft" && (
              <Link href={dealHref} className="text-[11px] font-semibold text-amber-700 hover:underline">
                Chase →
              </Link>
            )}
          </div>
        )}
        {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}
