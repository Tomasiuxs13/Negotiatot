"use client";

import { useState, useTransition } from "react";
import { moveDealStage } from "@/app/pipeline-actions";
import { isWonStage, STAGES, STAGE_HELP, STAGE_LABELS, type Stage } from "@/lib/types";

/**
 * The stages a deal can be moved between freely. The won ones are reached through their
 * guarded actions instead — Mark agreed, confirming the contract, Complete — because
 * each has checks behind it. Asking the predicate rather than naming stages is what
 * stopped "Active" appearing here and letting a deal skip Agreed entirely.
 */
const NEGOTIATION_STAGES = STAGES.filter((stage) => !isWonStage(stage.key));

/**
 * Makes the lifecycle visible on every deal and gives pre-agreement stages an explicit,
 * keyboard-accessible movement control. Agreement and completion keep their dedicated
 * guarded actions in the header because they have commercial and fulfillment effects.
 */
export default function DealStageBar({
  dealId,
  stage,
  note,
}: {
  dealId: number;
  stage: Stage;
  /** Where this stage actually stands — e.g. "Follow-up 2 · 3d ago" while contacted. */
  note?: string;
}) {
  const current = stage;
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeIndex = STAGES.findIndex((item) => item.key === current);
  const canChangeNegotiationStage = NEGOTIATION_STAGES.some((item) => item.key === current);

  const changeStage = (next: Stage) => {
    if (next === current) return;
    setError(null);
    startTransition(async () => {
      const result = await moveDealStage(dealId, next);
      if (result.error) setError(result.error);
    });
  };

  return (
    <section
      aria-label="Deal stage"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="label-caps text-slate-400">Current stage</span>
            <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-dark">
              {STAGE_LABELS[current]}
            </span>
            {note && <span className="font-data text-xs text-slate-500">{note}</span>}
          </div>
          <p className="mt-1 text-sm font-medium text-slate-800">
            {STAGE_HELP[current].description}
          </p>
          <p className="text-xs text-slate-500">Next: {STAGE_HELP[current].next}</p>
        </div>

        {canChangeNegotiationStage ? (
          <label className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-600">
            Move deal to
            <select
              aria-label="Move deal to stage"
              value={current}
              disabled={isPending}
              onChange={(event) => changeStage(event.target.value as Stage)}
              className="min-w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20 disabled:opacity-50"
            >
              {NEGOTIATION_STAGES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="max-w-sm text-xs text-slate-500 xl:text-right">
            {current === "agreed"
              ? "Confirm the signed contract in Fulfillment to start delivery."
              : current === "active"
                ? "In delivery. Complete it when the work and the money are done."
              : current === "completed"
                ? "Completed deals can be reopened from their guarded action when needed."
                : "Use Reopen to return this deal to the active pipeline."}
          </p>
        )}
      </div>

      <ol className="mt-3 flex items-center gap-1 overflow-x-auto pb-0.5" aria-label="Deal journey">
        {STAGES.map((item, index) => {
          const isCurrent = item.key === current;
          const isPast = activeIndex >= 0 && index < activeIndex;
          return (
            <li key={item.key} className="flex shrink-0 items-center gap-1">
              <span
                className={`flex min-w-24 items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-semibold ${
                  isCurrent
                    ? "bg-brand text-white"
                    : isPast
                      ? "bg-brand-soft text-brand-dark"
                      : "bg-slate-100 text-slate-500"
                }`}
                aria-current={isCurrent ? "step" : undefined}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }} aria-hidden>
                  {isPast ? "check" : isCurrent ? "radio_button_checked" : "circle"}
                </span>
                <span className="whitespace-nowrap">{item.label}</span>
              </span>
              {index < STAGES.length - 1 && (
                <span className="material-symbols-outlined shrink-0 text-slate-300" style={{ fontSize: 13 }} aria-hidden>
                  chevron_right
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
