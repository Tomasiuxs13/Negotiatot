import type { Deal } from "@/lib/types";
import type { ContentItem, PaymentItem } from "@/lib/fulfillment-types";
import { fulfillmentSummary } from "@/lib/fulfillment-rules";
import { euro } from "@/lib/format";
import { dealCommission, trueDealCost } from "@/lib/commission";

/**
 * What a signed deal is actually about: the fee, how much of the work has landed,
 * and what is still owed. Replaces the price ladder once the price stops being the
 * open question — a closed deal shouldn't still show "their ask".
 */
export default function DealProgress({
  deal,
  contentItems,
  paymentItems,
  aov = 0,
  productCost = 0,
}: {
  deal: Deal;
  contentItems: ContentItem[];
  paymentItems: PaymentItem[];
  /** Average order value from the Playbook, for costing commission on real orders. */
  aov?: number;
  /** What the gifted product costs us — free to them, not to us. */
  productCost?: number;
}) {
  const s = fulfillmentSummary(contentItems, paymentItems);
  const paid = paymentItems.filter((p) => p.status === "paid").reduce((n, p) => n + p.amount, 0);
  const fee = deal.agreed_price ?? paymentItems.reduce((n, p) => n + p.amount, 0);
  const pct = s.totalContent > 0 ? Math.round((s.verified / s.totalContent) * 100) : 0;

  // What the deal really cost: the fee plus commission actually earned on real orders.
  const commission = dealCommission(deal);
  const hasCommissionCost = commission.type !== "none" && Boolean(deal.actual_orders) && aov > 0;
  const cost =
    hasCommissionCost || productCost > 0
      ? trueDealCost({
          fee,
          expectedOrders: deal.actual_orders ?? 0,
          aov,
          commission,
          productCost,
        })
      : null;

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

      {cost && (
        <div>
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            True cost
          </div>
          <div className="text-2xl font-semibold font-tabular text-slate-900">
            {euro(cost.total)}
          </div>
          <div className="text-xs text-slate-500">
            {[
              cost.commission > 0
                ? `+ ${euro(cost.commission)} commission on ${deal.actual_orders} orders`
                : null,
              cost.product > 0 ? `+ ${euro(cost.product)} product` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      )}

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
