import type { Deal } from "@/lib/types";
import type { ContentItem, PaymentItem } from "@/lib/fulfillment-types";
import { fulfillmentSummary } from "@/lib/fulfillment-rules";
import { euro } from "@/lib/format";

/**
 * What a signed deal is actually about: the fee, how much of the work has landed,
 * and what is still owed. Replaces the price ladder once the price stops being the
 * open question — a closed deal shouldn't still show "their ask".
 */
export default function DealProgress({
  deal,
  contentItems,
  paymentItems,
}: {
  deal: Deal;
  contentItems: ContentItem[];
  paymentItems: PaymentItem[];
}) {
  const s = fulfillmentSummary(contentItems, paymentItems);
  const paid = paymentItems.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount, 0);
  const fee = deal.agreed_price ?? paymentItems.reduce((n, p) => n + p.amount, 0);
  const pct = s.totalContent > 0 ? Math.round((s.verified / s.totalContent) * 100) : 0;

  const savedVsAsk =
    deal.first_ask != null && deal.agreed_price != null ? deal.first_ask - deal.agreed_price : null;

  return (
    <div className="mt-4 flex items-end gap-8 flex-wrap">
      <div>
        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
          Agreed fee
        </div>
        <div className="text-2xl font-semibold font-tabular text-slate-900">{euro(fee)}</div>
        {savedVsAsk != null && savedVsAsk > 0 && (
          <div className="text-xs text-emerald-600 font-medium">
            {euro(savedVsAsk)} below their first ask
          </div>
        )}
      </div>

      <div className="min-w-40">
        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
          Content
        </div>
        <div className="text-2xl font-semibold font-tabular text-slate-900">
          {s.verified}
          <span className="text-slate-400 text-lg">/{s.totalContent}</span>
          <span className="text-sm font-normal text-slate-500 ml-1.5">verified</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5">
          <div
            className={`h-1.5 rounded-full ${s.overdue > 0 ? "bg-amber-400" : "bg-brand"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {s.overdue > 0 && (
          <div className="text-xs text-red-600 font-medium mt-1">
            {s.overdue} overdue
          </div>
        )}
      </div>

      <div>
        <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
          Paid out
        </div>
        <div className="text-2xl font-semibold font-tabular text-slate-900">{euro(paid)}</div>
        {s.unpaid > 0 && (
          <div className="text-xs text-slate-500">
            {euro(s.unpaid)} outstanding
            {s.awaitingApproval > 0 && (
              <span className="text-amber-600 font-medium"> · {s.awaitingApproval} to approve</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
