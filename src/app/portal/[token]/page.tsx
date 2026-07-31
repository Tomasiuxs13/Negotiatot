import { getBrandProfile, getPartnerByToken, getPartnerDeals } from "@/lib/db";
import { getContentItems, getPaymentItems, getShipments } from "@/lib/fulfillment";
import { CONTENT_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/fulfillment-types";
import { draftDueDate } from "@/lib/timeline";
import { money } from "@/lib/format";
import LiveUrlForm from "@/components/portal/LiveUrlForm";
import DraftForm from "@/components/portal/DraftForm";

export const dynamic = "force-dynamic";

/**
 * The creator's window into their collaborations. Public by design — the link is the
 * credential — so it shows only what is already theirs: their deliverables and dates,
 * their delivery, their payments. Never the brand's targets, caps or margins.
 */
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const partner = getPartnerByToken(token);
  const brand = (getBrandProfile() as Record<string, string>).brandName || "the team";

  if (!partner) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 max-w-md text-center">
          <p className="text-sm font-medium text-slate-800 mb-1">This link isn&apos;t valid</p>
          <p className="text-sm text-slate-500">Check with your contact for a fresh one.</p>
        </div>
      </main>
    );
  }

  // Live collaborations only — a declined negotiation is not the creator's business.
  const deals = getPartnerDeals(partner.id).filter(
    (d) => d.stage === "agreed" || d.stage === "completed"
  );

  return (
    <main className="min-h-screen p-6 pt-12">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="font-headline text-lg font-semibold text-slate-900">
            Hi {partner.name} 👋
          </h1>
          <p className="text-sm text-slate-500">
            Your collaborations with {brand} — deliverables, delivery and payments, all in one
            place.
          </p>
        </div>

        {deals.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-8 text-center">
            <p className="text-sm text-slate-500">No active collaborations right now.</p>
          </div>
        )}

        {deals.map((deal) => {
          const items = getContentItems(deal.id);
          const shipments = getShipments(deal.id);
          const payments = getPaymentItems(deal.id);
          return (
            <div key={deal.id} className="bg-white rounded-lg border border-slate-200 shadow-sm p-5 space-y-4">
              <h2 className="font-headline text-sm font-semibold text-slate-900">
                {deal.deliverables ?? deal.format ?? "Collaboration"}
                <span className="font-normal text-slate-400"> · {deal.stage === "completed" ? "completed" : "active"}</span>
              </h2>

              {items.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Content</h3>
                  <div className="divide-y divide-slate-100">
                    {items.map((c) => (
                      <div key={c.id} className="py-2">
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-slate-800 flex-1">{c.title}</span>
                          <span className="text-[11px] font-semibold rounded-full px-2 py-0.5 bg-slate-100 text-slate-600">
                            {CONTENT_STATUS_LABEL[c.status]}
                          </span>
                          {c.due_date && (
                            <span className="text-xs text-slate-400 font-tabular">
                              draft by {draftDueDate(c.due_date)} · live {c.due_date}
                            </span>
                          )}
                        </div>
                        {(c.status === "planned" || c.status === "in_production" || c.status === "submitted") && (
                          <>
                            {c.change_request && c.status === "in_production" && (
                              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-1.5 whitespace-pre-wrap">
                                Changes requested — check your email for details, then resubmit the
                                revised draft below.
                              </p>
                            )}
                            <DraftForm
                              token={token}
                              contentItemId={c.id}
                              initialUrl={c.draft_url ?? ""}
                              submitted={c.status === "submitted"}
                              round={c.revision_round ?? 0}
                            />
                          </>
                        )}
                        {(c.status === "approved" || c.status === "posted") && (
                          <LiveUrlForm token={token} contentItemId={c.id} initialUrl={c.posted_url ?? ""} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {shipments.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Product delivery</h3>
                  {shipments.map((s) => (
                    <p key={s.id} className="text-sm text-slate-700 py-1">
                      {s.product} —{" "}
                      {s.status === "to_prepare" ? "being prepared" : s.status === "shipped" ? `on its way${s.tracking ? ` · tracking ${s.tracking}` : ""}` : "delivered"}
                    </p>
                  ))}
                </div>
              )}

              {payments.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mb-1">Payments</h3>
                  {payments.map((p) => (
                    <p key={p.id} className="text-sm text-slate-700 py-1 flex justify-between">
                      <span>{p.description}</span>
                      <span className="font-tabular">
                        {money(p.amount)} · {p.status === "approvable" ? "processing" : PAYMENT_STATUS_LABEL[p.status].toLowerCase()}
                      </span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <p className="text-[11px] text-slate-400 text-center">
          Questions? Reply to your contact at {brand} directly.
        </p>
      </div>
    </main>
  );
}
