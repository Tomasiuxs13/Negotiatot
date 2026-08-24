"use client";

import { useState, useTransition } from "react";
import { moveDealStage } from "@/app/pipeline-actions";
import { money } from "@/lib/format";

/** Accessible alternative to the pipeline's drag-only agreement transition. */
export default function MarkAgreedButton({
  dealId,
  price,
}: {
  dealId: number;
  price?: number | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
      >
        Mark agreed
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-slate-600">
        {price != null ? `Confirm at ${money(price)}?` : "Confirm this deal is agreed?"}
      </span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await moveDealStage(dealId, "agreed");
            if (result.error) setError(result.error);
            else setNotice([result.setup, result.warning].filter(Boolean).join(" "));
          });
        }}
        className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
      >
        {isPending ? "Saving…" : "Confirm"}
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setConfirming(false);
          setError(null);
        }}
        className="px-1 text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
      >
        Cancel
      </button>
      {error && <span className="basis-full text-right text-xs text-red-600">{error}</span>}
      {notice && <span className="basis-full text-right text-xs text-emerald-700">{notice}</span>}
    </div>
  );
}
