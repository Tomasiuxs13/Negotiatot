import PageHeader from "@/components/PageHeader";
import NewDealForm from "@/components/new/NewDealForm";

export default function NewDealPage() {
  return (
    <>
      <PageHeader
        title="New deal"
        subtitle="Give Counterpart whatever you have — a report, a message, a link. More inputs, sharper numbers."
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="grid grid-cols-[1.3fr_0.7fr] gap-4 items-start max-w-5xl">
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-6">
            <NewDealForm />
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
