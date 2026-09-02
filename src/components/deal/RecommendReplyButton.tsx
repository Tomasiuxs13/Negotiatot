"use client";

import { useTransition } from "react";
import { runRecommendation } from "@/app/deals/[id]/actions";

/**
 * Runs the Copilot against the thread as already logged.
 *
 * The engine has always read the whole thread, so a reply the Gmail sync imported is
 * available to it immediately — but nothing asked for a move. Pasting a reply was the
 * only trigger, so a message the app had logged by itself still had to be typed in a
 * second time to get a draft. This is that trigger, with nothing to retype.
 */
export default function RecommendReplyButton({
  dealId,
  busy = false,
  label = "Recommend a reply",
}: {
  dealId: number;
  busy?: boolean;
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(async () => void (await runRecommendation(dealId)))}
      disabled={isPending || busy}
      title="Read the messages already logged on this deal and draft the next move"
      className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-4 text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
        auto_awesome
      </span>
      {busy ? "Copilot is busy…" : isPending ? "Starting…" : label}
    </button>
  );
}
