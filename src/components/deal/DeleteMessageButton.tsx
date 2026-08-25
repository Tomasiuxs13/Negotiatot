"use client";

import { useState, useTransition } from "react";
import { deleteMessageAction } from "@/app/deals/[id]/actions";

/**
 * Removes a message pasted into the wrong deal. Two clicks, because the second one also
 * takes any recommendation generated from the message (it read the wrong ask) and
 * rewinds the deal's round, move and asks to what the remaining thread supports.
 */
export default function DeleteMessageButton({
  dealId,
  messageId,
}: {
  dealId: number;
  messageId: number;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const run = () =>
    startTransition(async () => {
      const r = await deleteMessageAction(dealId, messageId);
      if (r?.error) setError(r.error);
    });

  return (
    <span className="inline-flex items-center gap-1.5">
      {confirming ? (
        <>
          <button
            onClick={run}
            disabled={isPending}
            className="text-[10px] font-semibold text-red-600 hover:text-red-700 uppercase tracking-wider disabled:opacity-50"
          >
            {isPending ? "Removing…" : "Remove — also rewinds what it caused"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-[10px] text-slate-400 hover:text-slate-600 uppercase tracking-wider"
          >
            Keep
          </button>
        </>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          aria-label="Remove this message"
          title="Remove this message (wrong deal? mis-paste?)"
          className="text-slate-300 hover:text-red-600 leading-none"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
            close
          </span>
        </button>
      )}
      {error && <span className="text-[10px] text-red-600 normal-case">{error}</span>}
    </span>
  );
}
