import PageHeader from "@/components/PageHeader";
import NewDealForm from "@/components/new/NewDealForm";
import { getCampaigns, getPartners, getSetting } from "@/lib/db";
import { partnerPrefillById } from "@/lib/partner-prefill";

export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; stage?: string }>;
}) {
  const { partner: partnerParam, stage } = await searchParams;
  const isLeadCapture = stage === "lead" || stage === "contacted";
  const campaigns = getCampaigns().map((c) => ({
    id: c.id,
    name: c.name,
    objective: c.objective,
    primary_kpi: c.primary_kpi,
    kpi_target: c.kpi_target,
  }));
  const partners = getPartners().map((p) => ({ id: p.id, name: p.name }));
  const presetPartner = partnerParam
    ? (partnerPrefillById(Number(partnerParam)) ?? undefined)
    : undefined;
  // Your standard program rate, so a hybrid deal doesn't need it retyped every time.
  const econ = getSetting<Record<string, number>>("unit_economics");
  const defaultCommissionType = Number(econ?.commissionPerOrder ?? 0) > 0
    ? "per_order"
    : Number(econ?.commissionPercent ?? 0) > 0
      ? "percent"
      : "none";
  const defaultCommission =
    defaultCommissionType === "per_order"
      ? Number(econ?.commissionPerOrder ?? 0)
      : defaultCommissionType === "percent"
        ? Number(econ?.commissionPercent ?? 0)
        : 0;
  const defaultDiscount = (econ?.discountFixed || econ?.discountPercent) ?? 0;
  const defaultDiscountType = econ?.discountFixed
    ? "fixed"
    : econ?.discountPercent
      ? "percent"
      : "none";
  return (
    <>
      <PageHeader
        title={stage === "lead" ? "New lead" : stage === "contacted" ? "New contacted deal" : "New deal"}
        subtitle={
          isLeadCapture
            ? "Capture who you want to work with — analyze later, when the conversation is real."
            : "Give Counterpart whatever you have — a report, a message, a link. More inputs, sharper numbers."
        }
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-1 xl:grid-cols-[1.3fr_0.7fr] gap-4 items-start max-w-5xl">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
            <NewDealForm
              campaigns={campaigns}
              partners={partners}
              presetPartner={presetPartner}
              stage={stage}
              defaultCommission={defaultCommission}
              defaultCommissionType={defaultCommissionType}
              defaultDiscount={defaultDiscount}
              defaultDiscountType={defaultDiscountType}
            />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="font-headline text-sm font-semibold text-slate-900 mb-3">
              What happens next
            </h2>
            <div className="space-y-4">
              {[
                {
                  title: "Define the outcome",
                  body: "The campaign objective and primary KPI determine what good performance means before price enters the conversation.",
                },
                {
                  title: "Check fit & economics",
                  body: "Counterpart reviews creator evidence, audience quality, scope, rights, and your Playbook to calculate a negotiation range.",
                },
                {
                  title: "Approve the next move",
                  body: "You choose whether to negotiate, contract, or pass. After publishing, results are reported against the campaign's primary KPI.",
                },
              ].map((s, i) => (
                <div key={s.title} className="flex gap-3">
                  <span className="w-6 h-6 shrink-0 rounded-full bg-brand/10 text-brand-dark flex items-center justify-center text-[11px] font-bold font-tabular">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
