import Link from "next/link";
import { notFound } from "next/navigation";
import PartnerProfile from "@/components/partners/PartnerProfile";
import { getPartner, getPartnerChannels, getPartnerDeals } from "@/lib/db";
import { partnerStats } from "@/lib/partners";
import { STAGES, dealPlatforms, PLATFORM_META } from "@/lib/types";
import { euro, euroCpm } from "@/lib/format";

export const dynamic = "force-dynamic";

const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = getPartner(Number(id));
  if (!partner) notFound();

  const channels = getPartnerChannels(partner.id);
  const deals = getPartnerDeals(partner.id);
  const stats = partnerStats(deals);

  const kpis = [
    { label: "Deals", value: String(stats.totalDeals), sub: `${stats.activeDeals} active` },
    { label: "Won", value: String(stats.wonDeals), sub: "closed deals" },
    { label: "Committed", value: euro(stats.committed), sub: "agreed fees" },
    { label: "Paid", value: stats.paid > 0 ? euro(stats.paid) : "—", sub: "completed deals" },
    {
      label: "Actual CPM",
      value: stats.actualCpm != null ? euroCpm(stats.actualCpm) : "—",
      sub: stats.actualCpm != null ? "from logged actuals" : "no actuals logged",
    },
    {
      label: "Saved vs ask",
      value: stats.savedVsAsk > 0 ? euro(stats.savedVsAsk) : "—",
      sub: "negotiated down",
      good: true,
    },
  ];

  return (
    <main className="flex-1 overflow-y-auto p-8">
      <div className="text-xs text-slate-500 mb-3">
        <Link href="/partners" className="underline underline-offset-2 hover:text-slate-700">
          Partners
        </Link>{" "}
        / {partner.name}
      </div>

      <div className="space-y-4 max-w-5xl">
        <PartnerProfile partner={partner} channels={channels} />

        <div className="grid grid-cols-5 gap-3">
          {kpis.map((k) => (
            <div key={k.label} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
              <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                {k.label}
              </div>
              <div
                className={`text-xl font-semibold font-tabular mt-1 ${
                  k.good ? "text-emerald-600" : "text-slate-900"
                }`}
              >
                {k.value}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{k.sub}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
            <h3 className="font-headline text-sm font-semibold text-slate-900">Deal history</h3>
            <Link
              href={`/new?partner=${partner.id}`}
              className="bg-brand hover:bg-brand-dark text-white rounded-md py-1.5 px-3.5 text-xs font-medium transition-colors"
            >
              + Start a deal
            </Link>
          </div>
          {deals.length === 0 ? (
            <p className="text-sm text-slate-500 px-4 py-6">
              No deals yet — start one to bring this partner into the pipeline.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-2.5 font-medium">Deal</th>
                  <th className="px-4 py-2.5 font-medium">Stage</th>
                  <th className="px-4 py-2.5 font-medium">Campaign</th>
                  <th className="px-4 py-2.5 font-medium text-right">Their ask</th>
                  <th className="px-4 py-2.5 font-medium text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/deals/${d.id}`} className="font-medium text-slate-900 hover:text-brand">
                        {d.deliverables ?? d.format ?? "Deal"}
                      </Link>
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {dealPlatforms(d).map((p) => (
                          <span key={p} className="material-symbols-outlined text-slate-400" style={{ fontSize: 13 }}>
                            {PLATFORM_META[p].icon}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{STAGE_LABEL[d.stage] ?? d.stage}</td>
                    <td className="px-4 py-2.5 text-slate-500">{d.campaign ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-tabular text-slate-500">
                      {euro(d.first_ask)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-tabular">
                      {euro(d.agreed_price ?? d.current_offer)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
