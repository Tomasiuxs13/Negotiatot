import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NewPartnerButton from "@/components/partners/NewPartnerButton";
import { getPartnerChannels, getPartnerDeals, getPartners } from "@/lib/db";
import { parseTags, partnerStats } from "@/lib/partners";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { euro, euroCpm } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const needle = q.trim().toLowerCase();

  const rows = getPartners().map((p) => {
    const deals = getPartnerDeals(p.id);
    return {
      partner: p,
      tags: parseTags(p.tags),
      channels: getPartnerChannels(p.id),
      stats: partnerStats(deals),
    };
  });

  const filtered = needle
    ? rows.filter(
        (r) =>
          r.partner.name.toLowerCase().includes(needle) ||
          r.partner.email?.toLowerCase().includes(needle) ||
          r.tags.some((t) => t.toLowerCase().includes(needle))
      )
    : rows;

  return (
    <>
      <PageHeader
        title="Partners"
        subtitle="Every creator you've worked with, and what each one is worth"
        actions={<NewPartnerButton />}
      />
      <main className="flex-1 overflow-y-auto p-8">
        <form className="mb-4 max-w-sm">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, email, or tag…"
            className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
          />
        </form>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-slate-300 p-10 text-center max-w-xl">
            <p className="text-sm font-medium text-slate-700 mb-1">
              {needle ? "No partners match that search" : "No partners yet"}
            </p>
            <p className="text-sm text-slate-500">
              {needle
                ? "Try a different name or tag."
                : "Partners appear here automatically when you create deals, or add one manually."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <th className="px-4 py-3 font-medium">Partner</th>
                  <th className="px-4 py-3 font-medium">Channels</th>
                  <th className="px-4 py-3 font-medium text-right">Deals</th>
                  <th className="px-4 py-3 font-medium text-right">Total spend</th>
                  <th className="px-4 py-3 font-medium text-right">Avg CPM</th>
                  <th className="px-4 py-3 font-medium text-right">Saved</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ partner, tags, channels, stats }) => (
                  <tr key={partner.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/partners/${partner.id}`}
                        className="font-medium text-slate-900 hover:text-brand"
                      >
                        {partner.name}
                      </Link>
                      {tags.length > 0 && (
                        <span className="ml-2 inline-flex gap-1">
                          {tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5"
                            >
                              {t}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 text-slate-500">
                        {channels.map((c) => (
                          <span
                            key={c.id}
                            title={PLATFORM_META[c.platform as Platform]?.label ?? c.platform}
                            className="flex items-center"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                              {PLATFORM_META[c.platform as Platform]?.icon ?? "public"}
                            </span>
                          </span>
                        ))}
                        {channels.length === 0 && <span className="text-xs text-slate-400">—</span>}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-tabular">
                      {stats.totalDeals}
                      {stats.activeDeals > 0 && (
                        <span className="text-xs text-amber-600 ml-1">({stats.activeDeals} active)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-tabular">{euro(stats.totalSpend)}</td>
                    <td className="px-4 py-3 text-right font-tabular text-slate-500">
                      {stats.avgClosedCpm != null ? euroCpm(stats.avgClosedCpm) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-tabular text-emerald-600">
                      {stats.savedVsAsk > 0 ? euro(stats.savedVsAsk) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
