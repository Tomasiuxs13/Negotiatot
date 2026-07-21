"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDeal } from "@/app/deals/[id]/actions";

export default function DeleteDealButton({ dealId, creator }: { dealId: number; creator: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = () => {
    if (!window.confirm(`Delete the deal with ${creator}? This removes the full message history and can't be undone.`)) {
      return;
    }
    startTransition(async () => {
      await deleteDeal(dealId);
      router.push("/pipeline");
    });
  };

  return (
    <button
      onClick={run}
      disabled={isPending}
      title="Delete deal"
      className="text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
    </button>
  );
}
