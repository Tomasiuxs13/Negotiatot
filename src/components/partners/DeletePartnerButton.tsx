"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePartnerAction } from "@/app/partners/actions";

/**
 * Row-level delete for the partners list. Cascades to the partner's deals, so the
 * confirm says so plainly and points to Archive when hiding is what's wanted.
 */
export default function DeletePartnerButton({
  id,
  name,
  dealCount,
}: {
  id: number;
  name: string;
  dealCount: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const remove = () => {
    const withDeals =
      dealCount > 0
        ? ` and their ${dealCount} deal${dealCount === 1 ? "" : "s"} (content, payments and history)`
        : "";
    if (
      !window.confirm(
        `Delete ${name}${withDeals}? This can't be undone. To just hide them, open the partner and use Archive.`
      )
    )
      return;
    startTransition(async () => {
      await deletePartnerAction(id);
      router.refresh();
    });
  };

  return (
    <button
      onClick={remove}
      disabled={isPending}
      title={`Delete ${name}`}
      aria-label={`Delete ${name}`}
      className="text-slate-300 hover:text-red-600 transition-colors disabled:opacity-50"
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
        delete
      </span>
    </button>
  );
}
