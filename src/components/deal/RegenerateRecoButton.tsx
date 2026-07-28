"use client";

import { useTransition } from "react";
import { runRecommendation } from "@/app/deals/[id]/actions";

/**
 * Redoes the Copilot's move against the current Playbook.
 *
 * Without this the only way to refresh a recommendation was to paste a new message from
 * the creator — so changing your rules (a commission rate, a product cost, a CPM
 * ceiling) left the offer on screen priced by the old ones, with no way to correct it.
 */
export default function RegenerateRecoButton({
  dealId,
  busy = false,
}: {
  dealId: number;
  busy?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const disabled = isPending || busy;

  return (
    <button
      onClick={() => startTransition(async () => void (await runRecommendation(dealId)))}
      disabled={disabled}
      title="Redo this recommendation using your current Playbook rules and deal data"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50 transition-colors"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
        refresh
      </span>
      {isPending ? "Starting…" : "Redo with current rules"}
    </button>
  );
}
