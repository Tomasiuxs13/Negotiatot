import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import NewPartnerButton from "@/components/partners/NewPartnerButton";
import { getCreatorCategories, getPartnerChannels, getPartnerColumns, getPartnerDeals, getPartners } from "@/lib/db";
import { getAllOnboardingTasks } from "@/lib/fulfillment";
import { setupProgress, setupState } from "@/lib/setup-progress";
import { blockingLabel } from "@/lib/fulfillment-types";
import { parseTags, partnerStats, partnerStatus } from "@/lib/partners";
import PartnerStatusPill from "@/components/partners/PartnerStatusPill";
import DeletePartnerButton from "@/components/partners/DeletePartnerButton";
import { PLATFORM_META, type Platform } from "@/lib/types";
import { money, moneyCpm } from "@/lib/format";
import FilterPills, { SortHeader } from "@/components/FilterBar";
import { PARTNER_STATUS_LABEL, type PartnerStatus } from "@/lib/partners";
import { buildQuery, nextDir, sortBy, type SortDir } from "@/lib/table-sort";
import ColumnPicker from "@/components/partners/ColumnPicker";
import {
  ADDED_RANGES,
  addedWithin,
  PARTNER_COLUMNS,
  parseAddedRange,
  type PartnerColumnKey,
} from "@/lib/partner-columns";

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
  searchParams: Promise<{
    q?: string;
    status?: string;
    setup?: string;
    category?: string;
    added?: string;
    platform?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const { q = "", status = "", setup = "", category = "", platform = "", sort = "", dir = "desc" } = params;
  const added = parseAddedRange(params.added);
  const columns = getPartnerColumns();
  const visible = PARTNER_COLUMNS.filter((column) => columns.includes(column.key));
  const needle = q.trim().toLowerCase();

  // Onboarding is partner-scoped by design, so "is this creator ready" belongs here
  // rather than being rediscovered one deal page at a time.
  const onboarding = getAllOnboardingTasks();

  const rows = getPartners().map((p) => {
    const deals = getPartnerDeals(p.id);
    const progress = setupProgress(onboarding, p.id);
    return {
      partner: p,
      tags: parseTags(p.tags),
      channels: getPartnerChannels(p.id),
      partnerDeals: deals,
      status: partnerStatus(deals),
      stats: partnerStats(deals),
      progress,
      setup: setupState(progress),
    };
  });

  let filtered = needle
    ? rows.filter(
        (r) =>
          r.partner.name.toLowerCase().includes(needle) ||
          r.partner.email?.toLowerCase().includes(needle) ||
          r.partner.category?.toLowerCase().includes(needle) ||
          r.tags.some((t) => t.toLowerCase().includes(needle))
      )
    : rows;
  if (status) filtered = filtered.filter((r) => r.status === status);
  // Properties you can filter on without displaying them — the point of having a
  // catalogue rather than a fixed row of columns.
  if (category)
    filtered = filtered.filter((r) =>
      category === "none" ? !r.partner.category : r.partner.category === category
    );
  if (added) filtered = filtered.filter((r) => addedWithin(r.partner.created_at, added));
  if (platform)
    filtered = filtered.filter((r) => r.channels.some((c) => c.platform === platform));
  if (setup === "blocked") filtered = filtered.filter((r) => r.setup === "blocked");
  else if (setup === "incomplete")
    filtered = filtered.filter((r) => r.setup === "blocked" || r.setup === "in_progress");

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
                  : sort === "added"
                    ? r.partner.created_at
                    : sort === "category"
                      ? (r.partner.category ?? "")
                      : r.partner.name,
      dir as SortDir
    );
  }

  const categories = getCreatorCategories();
  /** Only platforms this book actually has, so the filter never offers an empty result. */
  const platformsPresent = [
    ...new Set(rows.flatMap((r) => r.channels.map((c) => c.platform))),
  ].sort() as Platform[];

  const href = (changes: Record<string, string>) =>
    buildQuery("/partners", params as Record<string, string>, changes, { dir: "desc" });
  const sortHref = (key: string) => href({ sort: key, dir: nextDir(sort === key, dir as SortDir) });

  return (
    <>
      <PageHeader
        title="Partners"
        subtitle="Creator relationships, history, and setup"
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
          {/* Its own control rather than another status pill: setup is orthogonal to the
              lifecycle — a creator can be mid-delivery and still have no tracking link. */}
          {rows.some((r) => r.setup === "blocked") && (
            <Link
              href={href({ setup: setup === "blocked" ? "" : "blocked" })}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                setup === "blocked"
                  ? "bg-red-600 text-white border-red-600"
                  : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
              }`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                link_off
              </span>
              {rows.filter((r) => r.setup === "blocked").length} missing tracking setup
            </Link>
          )}
          {/* Property filters. GET forms with an auto-submit, so a filtered view is a URL
              you can keep, and the back button undoes a filter like it undoes anything. */}
          <form className="flex items-center gap-2">
            {q && <input type="hidden" name="q" value={q} />}
            {status && <input type="hidden" name="status" value={status} />}
            {setup && <input type="hidden" name="setup" value={setup} />}
            {sort && <input type="hidden" name="sort" value={sort} />}
            {categories.length > 0 && (
              <select
                name="category"
                defaultValue={category}
                aria-label="Filter by category"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="">All categories</option>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                <option value="none">No category</option>
              </select>
            )}
            <select
              name="added"
              defaultValue={added}
              aria-label="Filter by date added"
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
            >
              {ADDED_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
            {platformsPresent.length > 1 && (
              <select
                name="platform"
                defaultValue={platform}
                aria-label="Filter by platform"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700"
              >
                <option value="">All platforms</option>
                {platformsPresent.map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_META[p]?.label ?? p}
                  </option>
                ))}
              </select>
            )}
            <button className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
              Apply
            </button>
          </form>
          <ColumnPicker visible={columns} />
          {(q || status || setup || sort || category || added || platform) && (
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
                <tr className="text-left label-caps text-slate-500 border-b border-slate-200">
                  {visible.map((column) =>
                    column.sortable ? (
                      <SortHeader
                        key={column.key}
                        label={column.label}
                        align={column.align}
                        href={sortHref(column.key)}
                        active={sort === column.key}
                        dir={dir as SortDir}
                      />
                    ) : (
                      <th
                        key={column.key}
                        className={`px-4 py-3 font-medium${column.align === "right" ? " text-right" : ""}`}
                      >
                        {column.label}
                      </th>
                    )
                  )}
                  <th className="px-4 py-3 font-medium text-right" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const { partner, tags, channels, status: rowStatus, stats, progress, setup: rowSetup } = row;
                  const dash = <span className="text-slate-200">—</span>;
                  /** One cell per property in the catalogue. */
                  const cell = (key: PartnerColumnKey) => {
                    switch (key) {
                      case "name":
                        return (
                          <Link
                            href={`/partners/${partner.id}`}
                            className="font-medium text-slate-900 hover:text-brand"
                          >
                            {partner.name}
                          </Link>
                        );
                      case "category":
                        return partner.category ? (
                          <span className="text-[10px] font-semibold bg-brand-soft text-brand-dark rounded-full px-2 py-0.5">
                            {partner.category}
                          </span>
                        ) : (
                          dash
                        );
                      case "status":
                        return <PartnerStatusPill status={rowStatus} />;
                      case "setup":
                        return rowSetup === "none" ? (
                          dash
                        ) : rowSetup === "ready" ? (
                          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                            Ready
                          </span>
                        ) : rowSetup === "blocked" ? (
                          <span
                            className="text-[11px] font-semibold text-red-700 bg-red-50 rounded-full px-2 py-0.5"
                            title={`Missing: ${blockingLabel(progress!.blockingLeft)}`}
                          >
                            No {blockingLabel(progress!.blockingLeft)}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-slate-500 font-data">
                            {progress!.done}/{progress!.total} done
                          </span>
                        );
                      case "channels":
                        return (
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
                        );
                      case "email":
                        return partner.email ? (
                          <a href={`mailto:${partner.email}`} className="text-xs text-slate-600 hover:text-brand">
                            {partner.email}
                          </a>
                        ) : (
                          dash
                        );
                      case "added":
                        return (
                          <span className="font-data text-xs text-slate-500">
                            {partner.created_at?.slice(0, 10) ?? "—"}
                          </span>
                        );
                      case "tags":
                        return tags.length > 0 ? (
                          <span className="inline-flex flex-wrap gap-1">
                            {tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="text-[10px] font-medium bg-slate-100 text-slate-600 rounded-full px-2 py-0.5"
                              >
                                {t}
                              </span>
                            ))}
                          </span>
                        ) : (
                          dash
                        );
                      case "deals":
                        return (
                          <span className="font-data whitespace-nowrap">
                            {stats.totalDeals}
                            {stats.activeDeals > 0 && (
                              <span className="text-xs text-amber-600 ml-1.5">· {stats.activeDeals} active</span>
                            )}
                          </span>
                        );
                      case "committed":
                        return stats.committed > 0 ? <span className="font-data">{money(stats.committed)}</span> : dash;
                      case "paid":
                        return stats.paid > 0 ? (
                          <span className="font-data text-slate-500">{money(stats.paid)}</span>
                        ) : (
                          dash
                        );
                      case "cpm":
                        return stats.actualCpm != null ? (
                          <span className="font-data text-slate-500">{moneyCpm(stats.actualCpm)}</span>
                        ) : (
                          dash
                        );
                      case "saved":
                        return stats.savedVsAsk > 0 ? (
                          <span className="font-data text-emerald-600">{money(stats.savedVsAsk)}</span>
                        ) : (
                          dash
                        );
                    }
                  };
                  return (
                    <tr key={partner.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      {visible.map((column) => (
                        <td
                          key={column.key}
                          className={`px-4 py-3${column.align === "right" ? " text-right" : ""}`}
                        >
                          {cell(column.key)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right">
                        <DeletePartnerButton
                          id={partner.id}
                          name={partner.name}
                          dealCount={stats.totalDeals}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
