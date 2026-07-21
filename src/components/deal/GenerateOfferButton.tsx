"use client";

import { useState, useTransition } from "react";
import { generateOpeningOffer } from "@/app/deals/[id]/actions";

export default function GenerateOfferButton({ dealId }: { dealId: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateOpeningOffer(dealId);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="bg-white rounded-lg border border-dashed border-slate-300 p-6 text-center">
      <p className="text-sm font-medium text-slate-700 mb-1">No conversation yet</p>
      <p className="text-sm text-slate-500 mb-4 max-w-md mx-auto">
        You&apos;re making the first move — Counterpart will draft an opening offer at your anchor,
        justified with the channel data, in three tones.
      </p>
      <button
        onClick={run}
        disabled={isPending}
        className="bg-brand hover:bg-brand-dark text-white rounded-md py-2 px-4 text-sm font-medium transition-colors shadow-sm disabled:opacity-60"
      >
        {isPending ? "Starting…" : "Generate opening offer"}
      </button>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </div>
  );
}
