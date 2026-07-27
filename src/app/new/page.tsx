import PageHeader from "@/components/PageHeader";
import NewDealForm from "@/components/new/NewDealForm";
import { getCampaigns, getPartner, getPartners, getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NewDealPage({
  searchParams,
}: {
  searchParams: Promise<{ partner?: string; stage?: string }>;
}) {
  const { partner: partnerParam, stage } = await searchParams;
  const isLeadCapture = stage === "lead" || stage === "contacted";
  const campaigns = getCampaigns().map((c) => ({ id: c.id, name: c.name }));
  const partners = getPartners().map((p) => ({ id: p.id, name: p.name }));
  const preset = partnerParam ? getPartner(Number(partnerParam)) : undefined;
  const presetPartner = preset ? { id: preset.id, name: preset.name } : undefined;
  // Your standard program rate, so a hybrid deal doesn't need it retyped every time.
  const econ = getSetting<Record<string, number>>("unit_economics");
  const defaultCommission = econ?.commissionPercent ?? 0;
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
        <div className="grid grid-cols-[1.3fr_0.7fr] gap-4 items-start max-w-5xl">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
            <NewDealForm
              campaigns={campaigns}
              partners={partners}
              presetPartner={presetPartner}
              stage={stage}
              defaultCommission={defaultCommission}
            />
          </div>

          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h2 className="font-headline text-sm font-semibold text-slate-900 mb-3">
              What happens next
            </h2>
            <div className="space-y-4">
              {[
                {
                  title: "Extract & analyze",
                  body: "Claude reads the report and message, pulls the real stats (avg views, engagement, audience), and checks them against your Playbook.",
                },
                {
                  title: "Your three numbers",
                  body: "Target, walk-away, and breakeven are computed from your rules and unit economics — with the math shown for each.",
                },
                {
                  title: "Verdict & first offer",
                  body: "Accept fast, negotiate, or walk away. Then head to the Negotiation tab for the ready-to-send opening message.",
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
