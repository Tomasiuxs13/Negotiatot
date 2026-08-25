"use client";

import { useState, useTransition } from "react";
import { saveDealNotesAction } from "@/app/deals/[id]/actions";

/**
 * Free-text notes on the deal — the context only a human knows ("prefers email",
 * "agency negotiates for him", "said budget resets in Q4"). The Copilot reads these as
 * background on the next analysis or recommendation, so writing things down here is
 * how the model stops re-learning them every round.
 */
export default function DealNotes({
  dealId,
  initialNotes,
}: {
  dealId: number;
  initialNotes: string;
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(initialNotes);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const dirty = notes !== saved;

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveDealNotesAction(dealId, notes);
      if (result?.error) setError(result.error);
      else setSaved(notes);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-headline text-sm font-semibold text-slate-900">Notes</h3>
        {dirty && (
          <button
            onClick={save}
            disabled={isPending}
            className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1 hover:bg-slate-800 disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Save notes"}
          </button>
        )}
        {!dirty && saved && <span className="text-xs text-slate-400">Saved</span>}
      </div>
      {/* The placeholder carries examples only. The fact that the Copilot reads these
          used to live in it too, which both overflowed the box in the narrow rail and
          hid the information the moment you started typing — so it is a standing hint. */}
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder="“prefers email”, “agency handles pricing”, “budget resets in Q4”…"
        className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand resize-y"
      />
      <p className="text-xs text-slate-400 mt-1.5">
        Read as context on the next run.
      </p>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
