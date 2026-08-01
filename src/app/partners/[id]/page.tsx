import Link from "next/link";
import { notFound } from "next/navigation";
import PartnerProfile from "@/components/partners/PartnerProfile";
import { ensurePartnerPortalToken, getPartner, getPartnerChannels, getPartnerDeals, getRemindersFor } from "@/lib/db";
import RemindersBlock from "@/components/RemindersBlock";
import { getPartnerOnboarding } from "@/lib/fulfillment";
import { partnerStats, partnerStatus } from "@/lib/partners";
import PartnerStatusPill from "@/components/partners/PartnerStatusPill";
import { dealPlatforms, PLATFORM_META, STAGE_LABELS } from "@/lib/types";
import { money, moneyCpm } from "@/lib/format";
import { PAGE_WIDTH } from "@/lib/layout";

export const dynamic = "force-dynamic";


export default async function PartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const partner = getPartner(Number(id));
  if (!partner) notFound();

  const channels = getPartnerChannels(partner.id);
  const deals = getPartnerDeals(partner.id);
  const stats = partnerStats(deals);
  const onboarding = getPartnerOnboarding(partner.id);

  const kpis = [
    { label: "Deals", value: String(stats.totalDeals), sub: `${stats.activeDeals} active` },
    { label: "Won", value: String(stats.wonDeals), sub: "closed deals" },
    { label: "Committed", value: money(stats.committed), sub: "agreed fees" },
    { label: "Paid", value: stats.paid > 0 ? money(stats.paid) : "—", sub: "completed deals" },
    {
      label: "Actual CPM",
      value: stats.actualCpm != null ? moneyCpm(stats.actualCpm) : "—",
      sub: stats.actualCpm != null ? "from logged actuals" : "no actuals logged",
    },
    {
      label: "Saved vs ask",
      value: stats.savedVsAsk > 0 ? money(stats.savedVsAsk) : "—",
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
        <span className="ml-2 align-middle">
          <PartnerStatusPill status={partnerStatus(deals)} />
        </span>
      </div>

      <div className={`space-y-4 ${PAGE_WIDTH}`}>
        <PartnerProfile partner={partner} channels={channels} dealCount={deals.length} />

        <RemindersBlock reminders={getRemindersFor({ partnerId: partner.id })} partnerId={partner.id} />

        {/* The creator's own window into their collaborations — the link is the
            credential, so share it only with them. */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium text-slate-600">Partner portal link</span>
          <code className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 break-all">
            /portal/{ensurePartnerPortalToken(partner.id)}
          </code>
          <span className="text-[11px] text-slate-400">
            Their deliverables, delivery and payment status — share it with {partner.name} only.
          </span>
        </div>

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

        {onboarding.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
            <h3 className="font-headline text-sm font-semibold text-slate-900 mb-1">
              Program setup
            </h3>
            <p className="text-xs text-slate-500 mb-3">
              Done once for {partner.name} — every future deal inherits this.
            </p>
            <div className="divide-y divide-slate-100">
              {onboarding.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 py-2">
                  <span
                    className={`material-symbols-outlined ${
                      t.status === "done" ? "text-emerald-600" : "text-slate-300"
                    }`}
                    style={{ fontSize: 16 }}
                  >
                    {t.status === "done" ? "check_circle" : "radio_button_unchecked"}
                  </span>
                  <span
                    className={`text-sm ${t.status === "done" ? "text-slate-500" : "text-slate-800"}`}
                  >
                    {t.label}
                  </span>
                  {t.value && (
                    <code className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 truncate max-w-64">
                      {t.value}
                    </code>
                  )}
                  {t.owner === "creator" && t.status !== "done" && (
                    <span className="text-[10px] font-semibold bg-sky-50 text-sky-700 rounded-full px-1.5 py-0.5">
                      on creator
                    </span>
                  )}
                  {t.completed_at && (
                    <span className="ml-auto text-xs text-slate-400 font-tabular">
                      {t.completed_at}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
                  <th className="px-4 py-2.5 font-medium text-right" title="What that price actually cost per 1000 views">
                    Real CPM
                  </th>
                  <th className="px-4 py-2.5 font-medium text-right">When</th>
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
                    <td className="px-4 py-2.5 text-slate-600">{STAGE_LABELS[d.stage]}</td>
                    <td className="px-4 py-2.5 text-slate-500">{d.campaign ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-tabular text-slate-500">
                      {money(d.first_ask)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-tabular">
                      {money(d.agreed_price ?? d.current_offer)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-tabular text-slate-500">
                      {d.actual_views && d.agreed_price
                        ? moneyCpm((d.agreed_price / d.actual_views) * 1000)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-400 whitespace-nowrap">
                      {d.updated_at.slice(0, 10)}
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
