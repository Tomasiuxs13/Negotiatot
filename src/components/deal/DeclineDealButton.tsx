"use client";

import { useState, useTransition } from "react";
import { DECLINE_REASONS, type DeclineReason } from "@/lib/types";
import { declineDealAction } from "@/app/pipeline-actions";

/** Three months out — the usual "come back next quarter" default. */
function defaultRevisitDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString().slice(0, 10);
}

export default function DeclineDealButton({ dealId }: { dealId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<DeclineReason | null>(null);
  const [note, setNote] = useState("");
  const [revisitOn, setRevisitOn] = useState(defaultRevisitDate);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!reason) return;
    startTransition(async () => {
      setError(null);
      const result = await declineDealAction(dealId, { reason, note, revisitOn });
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium rounded-md px-3 py-1.5 border border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600 transition-colors"
      >
        Decline
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-md p-5">
        <h3 className="font-headline text-base font-semibold text-slate-900">
          Why is this deal not going ahead?
        </h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          The reason is what makes a loss useful later — it shows up in your win rate and
          tells you whether your ceiling or your opening move needs adjusting.
        </p>

        <div className="space-y-1.5">
          {DECLINE_REASONS.map((r) => (
            <button
              key={r.key}
              onClick={() => setReason(r.key)}
              className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                reason === r.key
                  ? "border-brand bg-brand/5"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="text-sm font-medium text-slate-900">{r.label}</div>
              <div className="text-xs text-slate-500">{r.hint}</div>
            </button>
          ))}
        </div>

        {reason === "timing" && (
          <label className="block mt-3">
            <span className="text-xs font-semibold text-slate-700">Revisit on</span>
            <input
              type="date"
              value={revisitOn}
              onChange={(e) => setRevisitOn(e.target.value)}
              className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            />
            <span className="text-xs text-slate-400">
              Counterpart will put this back in front of you on that date.
            </span>
          </label>
        )}

        <label className="block mt-3">
          <span className="text-xs font-semibold text-slate-700">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. wouldn't go below $3,100 for a single integration"
            className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          />
        </label>

        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={() => setOpen(false)}
            className="text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!reason || isPending}
            className="bg-slate-900 hover:bg-slate-800 text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors disabled:opacity-40"
          >
            {isPending ? "Saving…" : "Mark declined"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
    </div>
  );
}
