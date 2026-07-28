"use client";

import Link from "next/link";
import { useTransition } from "react";
import type { PaymentItem } from "@/lib/fulfillment-types";
import { PAYMENT_STATUS_LABEL, PAYMENT_TRIGGER_LABEL, pendingReason } from "@/lib/fulfillment-types";
import { money } from "@/lib/format";
import { SortHeader } from "@/components/FilterBar";
import { nextDir, type SortDir } from "@/lib/table-sort";
import { setPaymentStatusAction } from "@/app/deals/[id]/fulfillment-actions";

const TONE: Record<string, string> = {
  pending: "bg-slate-100 text-slate-600",
  approvable: "bg-amber-50 text-amber-700",
  approved: "bg-sky-50 text-sky-700",
  paid: "bg-emerald-50 text-emerald-700",
};

export default function PaymentsQueue({
  payments,
  sort = "",
  dir = "desc",
  sortHrefs,
}: {
  payments: (PaymentItem & { creator: string })[];
  sort?: string;
  dir?: SortDir;
  /** Precomputed URLs — a client component can't receive the builder function itself. */
  sortHrefs?: { creator: string; amount: string };
}) {
  const [isPending, startTransition] = useTransition();

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-dashed border-slate-300 p-10 text-center max-w-2xl">
        <p className="text-sm font-medium text-slate-700 mb-1">No payments to show</p>
        <p className="text-sm text-slate-500">
          Nothing matches this filter — or no payments exist yet. They appear when you confirm a
          contract, or add them by hand on a deal&apos;s Fulfillment tab.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden max-w-5xl">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
            <th className="px-4 py-3 font-medium">Status</th>
            {sortHrefs ? (
              <SortHeader
                label="Partner"
                active={sort === "creator"}
                dir={dir}
                href={sortHrefs.creator}
              />
            ) : (
              <th className="px-4 py-3 font-medium">Partner</th>
            )}
            <th className="px-4 py-3 font-medium">Payment</th>
            <th className="px-4 py-3 font-medium">Trigger</th>
            {sortHrefs ? (
              <SortHeader
                label="Amount"
                align="right"
                active={sort === "amount"}
                dir={dir}
                href={sortHrefs.amount}
              />
            ) : (
              <th className="px-4 py-3 font-medium text-right">Amount</th>
            )}
            <th className="px-4 py-3 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-4 py-3">
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE[p.status]}`}>
                  {PAYMENT_STATUS_LABEL[p.status]}
                </span>
              </td>
              <td className="px-4 py-3">
                <Link href={`/deals/${p.deal_id}`} className="font-medium text-slate-900 hover:text-brand">
                  {p.creator}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-600">{p.description}</td>
              <td className="px-4 py-3 text-slate-500 text-xs">{PAYMENT_TRIGGER_LABEL[p.trigger]}</td>
              <td className="px-4 py-3 text-right font-tabular font-semibold">{money(p.amount)}</td>
              <td className="px-4 py-3 text-right">
                {p.status === "approvable" && (
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        await setPaymentStatusAction(p.id, p.deal_id, "approved");
                      })
                    }
                    disabled={isPending}
                    className="bg-brand hover:bg-brand-dark text-white rounded-md py-1 px-3 text-xs font-medium transition-colors disabled:opacity-60"
                  >
                    Approve
                  </button>
                )}
                {p.status === "approved" && (
                  <span className="inline-flex items-center gap-2">
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await setPaymentStatusAction(p.id, p.deal_id, "approvable");
                        })
                      }
                      disabled={isPending}
                      className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-50"
                      title="Undo approval"
                    >
                      undo
                    </button>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          await setPaymentStatusAction(p.id, p.deal_id, "paid");
                        })
                      }
                      disabled={isPending}
                      className="border border-slate-200 hover:border-slate-400 text-slate-700 rounded-md py-1 px-3 text-xs font-medium transition-colors disabled:opacity-60"
                    >
                      Mark paid
                    </button>
                  </span>
                )}
                {p.status === "pending" && (
                  <span className="text-xs text-slate-400">{pendingReason(p)}</span>
                )}
                {p.status === "paid" && p.paid_at && (
                  <span className="text-xs text-slate-400 font-tabular">{p.paid_at.slice(0, 10)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
