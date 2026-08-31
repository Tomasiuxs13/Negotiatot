import Link from "next/link";
import { notFound } from "next/navigation";
import PartnerProfile from "@/components/partners/PartnerProfile";
import {
  ensurePartnerPortalToken,
  getCreatorCategories,
  getRecordLayout,
  getPartner,
  getPartnerChannels,
  getPartnerDeals,
  getRemindersFor,
} from "@/lib/db";
import RemindersBlock from "@/components/RemindersBlock";
import ContactStrip from "@/components/deal/ContactStrip";
import { getContentItems, getPartnerOnboarding } from "@/lib/fulfillment";
import { partnerOperationalStats, partnerStats, partnerStatus } from "@/lib/partners";
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
  const operations = partnerOperationalStats(
    deals,
    deals.flatMap((deal) => getContentItems(deal.id))
  );
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
    {
      label: "Published",
      value:
        operations.promisedContent > 0
          ? `${operations.deliveredContent}/${operations.promisedContent}`
          : "—",
      sub: "tracked deliverables",
    },
    {
      label: "On time",
      value:
        operations.onTimeRate != null
          ? `${Math.round(operations.onTimeRate * 100)}%`
          : "—",
      sub: operations.onTimeRate != null ? "of dated posts" : "no dated posts",
    },
    {
      label: "Draft rounds",
      value:
        operations.averageRevisionRounds != null
          ? operations.averageRevisionRounds.toFixed(1)
          : "—",
      sub: "average submitted versions",
    },
  ];

  // Which record layout to draw — the same setting the deal page reads, so the two
  // record types never disagree about their own shape. See record-layout.ts.
  const workspace = getRecordLayout() === "workspace";

  // Each block of this record, defined once and arranged by the chosen layout —
  // so the two layouts can never drift into showing different things.

  const profileBlock = (
    <>
      <PartnerProfile
        partner={partner}
        channels={channels}
        dealCount={deals.length}
        categories={getCreatorCategories()}
      />
    </>
  );

  const contactBlock = (
    <>
      {/* The creator's own window into their collaborations — the link is the
          credential, so share it only with them. Copied as a full URL: a pasted
          relative path is a broken link. */}
      <ContactStrip
        creator={partner.name}
        email={partner.email}
        portalPath={`/portal/${ensurePartnerPortalToken(partner.id)}`}
      />
    </>
  );

  const kpisBlock = (
    <>
      <div className="@container">
      <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3 @5xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
            <div className="label-caps text-slate-500">
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
    </div>
    </>
  );

  const setupBlock = (
    <>
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
    </>
  );

  const historyBlock = (
    <>
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
          <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[46rem]">
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
                    <Link
                          href={`/deals/${d.id}`}
                          className="line-clamp-2 max-w-[16rem] font-medium text-slate-900 hover:text-brand"
                        >
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
          </div>
        )}
      </div>
    </>
  );

  const remindersBlock = (
    <>
      <RemindersBlock reminders={getRemindersFor({ partnerId: partner.id })} partnerId={partner.id} />
    </>
  );

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

      {workspace ? (
        <div className={`grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,26%)_minmax(0,45%)_minmax(0,29%)] ${PAGE_WIDTH}`}>
          {/* Below xl the work comes first; the properties follow it rather than
              standing between the header and the deal history. */}
          <aside className="order-2 flex min-w-0 flex-col gap-4 xl:order-1">
            {profileBlock}
            {contactBlock}
          </aside>
          <div className="order-1 flex min-w-0 flex-col gap-4 xl:order-2">
            {historyBlock}
          </div>
          <aside className="order-3 flex min-w-0 flex-col gap-4">
            {kpisBlock}
            {setupBlock}
            {remindersBlock}
          </aside>
        </div>
      ) : (
        <div className={`space-y-4 ${PAGE_WIDTH}`}>
          {profileBlock}
          {remindersBlock}
          {contactBlock}
          {kpisBlock}
          {setupBlock}
          {historyBlock}
        </div>
      )}
    </main>
  );
}
