import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NewPartnerButton from "@/components/partners/NewPartnerButton";
import { getPartnerChannels, getPartnerDeals, getPartners } from "@/lib/db";
import { parseTags, partnerStats, partnerStatus } from "@/lib/partners";
import PartnerStatusPill from "@/components/partners/PartnerStatusPill";
import DeletePartnerButton from "@/components/partners/DeletePartnerButton";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { euro, euroCpm } from "@/lib/format";
import FilterPills, { SortHeader } from "@/components/FilterBar";
import { PARTNER_STATUS_LABEL, type PartnerStatus } from "@/lib/partners";
import { buildQuery, nextDir, sortBy, type SortDir } from "@/lib/table-sort";

const PARTNER_STATUSES: PartnerStatus[] = [
  "delivering",
  "negotiating",
  "past",
  "prospect",
  "lapsed",
];

export const dynamic = "force-dynamic";

export default async function PartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; sort?: string; dir?: string }>;
}) {
  const params = await searchParams;
  const { q = "", status = "", sort = "", dir = "desc" } = params;
  const needle = q.trim().toLowerCase();

  const rows = getPartners().map((p) => {
    const deals = getPartnerDeals(p.id);
    return {
      partner: p,
      tags: parseTags(p.tags),
      channels: getPartnerChannels(p.id),
      partnerDeals: deals,
      status: partnerStatus(deals),
      stats: partnerStats(deals),
    };
  });

  let filtered = needle
    ? rows.filter(
        (r) =>
          r.partner.name.toLowerCase().includes(needle) ||
          r.partner.email?.toLowerCase().includes(needle) ||
          r.tags.some((t) => t.toLowerCase().includes(needle))
      )
    : rows;
  if (status) filtered = filtered.filter((r) => r.status === status);

  // Name order is the sensible default; anything else you ask for wins.
  if (sort) {
    filtered = sortBy(
      filtered,
      (r) =>
        sort === "committed"
          ? r.stats.committed
          : sort === "paid"
            ? r.stats.paid
            : sort === "cpm"
              ? r.stats.actualCpm
              : sort === "saved"
                ? r.stats.savedVsAsk
                : sort === "deals"
                  ? r.stats.totalDeals
                  : r.partner.name,
      dir as SortDir
    );
  }

  const href = (changes: Record<string, string>) =>
    buildQuery("/partners", params as Record<string, string>, changes, { dir: "desc" });
  const sortHref = (key: string) => href({ sort: key, dir: nextDir(sort === key, dir as SortDir) });

  return (
    <>
      <PageHeader
        title="Partners"
        subtitle="Every creator you've worked with, and what each one is worth"
        actions={<NewPartnerButton />}
      />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <form className="max-w-xs flex-1 min-w-56">
            {status && <input type="hidden" name="status" value={status} />}
            {sort && <input type="hidden" name="sort" value={sort} />}
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name, email, or tag…"
              className="w-full border border-slate-200 rounded-lg bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand"
            />
          </form>
          <FilterPills
            active={status}
            href={(v) => href({ status: v })}
            options={[
              { value: "", label: "All", count: rows.length },
              ...PARTNER_STATUSES.map((s) => ({
                value: s,
                label: PARTNER_STATUS_LABEL[s],
                count: rows.filter((r) => r.status === s).length,
              })).filter((o) => o.count > 0),
            ]}
          />
          {(q || status || sort) && (
            <Link href="/partners" className="text-xs text-slate-500 hover:text-slate-800">
              Clear
            </Link>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-slate-300 p-10 text-center max-w-xl">
            <p className="text-sm font-medium text-slate-700 mb-1">
              {needle || status ? "No partners match this view" : "No partners yet"}
            </p>
            <p className="text-sm text-slate-500">
              {needle || status
                ? "Try a different search or status."
                : "Partners appear here automatically when you create deals, or add one manually."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <SortHeader label="Partner" href={sortHref("name")} active={sort === "name"} dir={dir as SortDir} />
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Channels</th>
                  <SortHeader label="Deals" align="right" href={sortHref("deals")} active={sort === "deals"} dir={dir as SortDir} />
                  <SortHeader label="Committed" align="right" href={sortHref("committed")} active={sort === "committed"} dir={dir as SortDir} />
                  <SortHeader label="Paid" align="right" href={sortHref("paid")} active={sort === "paid"} dir={dir as SortDir} />
                  <SortHeader label="Actual CPM" align="right" href={sortHref("cpm")} active={sort === "cpm"} dir={dir as SortDir} />
                  <SortHeader label="Saved" align="right" href={sortHref("saved")} active={sort === "saved"} dir={dir as SortDir} />
                  <th className="px-4 py-3 font-medium text-right" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ partner, tags, channels, status: rowStatus, stats }) => (
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
                      <PartnerStatusPill status={rowStatus} />
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
                    <td className="px-4 py-3 text-right font-tabular whitespace-nowrap">
                      {stats.totalDeals}
                      {stats.activeDeals > 0 && (
                        <span className="text-xs text-amber-600 ml-1.5">
                          · {stats.activeDeals} active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-tabular">
                      {stats.committed > 0 ? euro(stats.committed) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-tabular text-slate-500">
                      {stats.paid > 0 ? euro(stats.paid) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-tabular text-slate-500">
                      {stats.actualCpm != null ? euroCpm(stats.actualCpm) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-tabular text-emerald-600">
                      {stats.savedVsAsk > 0 ? euro(stats.savedVsAsk) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeletePartnerButton
                        id={partner.id}
                        name={partner.name}
                        dealCount={stats.totalDeals}
                      />
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
