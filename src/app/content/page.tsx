import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ContentBoard from "@/components/content/ContentBoard";
import ContentCalendar from "@/components/content/ContentCalendar";
import ContentTable from "@/components/content/ContentTable";
import { getDeals, getCampaigns, getSetting } from "@/lib/db";
import { getAllContentItems, getAllOnboardingTasks, getAllShipments } from "@/lib/fulfillment";
import { dealPlatforms } from "@/lib/types";
import {
  awaitingShipment,
  blockingSetup,
  needsAttention,
  nextAction,
  resolvePlatform,
  urgencyScore,
  type ContentRow,
} from "@/lib/content-queue";
import { DEFAULT_MIN_GAP_DAYS } from "@/lib/content-calendar";
import { parseRequirements } from "@/lib/brief-requirements";
import { buildQuery, sortBy, type SortDir } from "@/lib/table-sort";

export const dynamic = "force-dynamic";

const PLATFORM_FILTERS = [
  { key: "", label: "All" },
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
];

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{
    platform?: string;
    view?: string;
    campaign?: string;
    q?: string;
    focus?: string;
    sort?: string;
    dir?: string;
    month?: string;
  }>;
}) {
  const params = await searchParams;
  const {
    platform = "",
    view = "board",
    campaign = "",
    q = "",
    focus = "",
    sort = "",
    dir = "asc",
  } = params;
  const onlyAttention = focus === "attention";

  const today = new Date().toISOString().slice(0, 10);
  const month = /^\d{4}-\d{2}$/.test(params.month ?? "") ? params.month! : today.slice(0, 7);
  const workflow = getSetting<Record<string, number>>("workflow");
  const draftLeadDays = Number(workflow?.draftLeadDays ?? 10);
  const minGapDays = Number(workflow?.minPostGapDays ?? DEFAULT_MIN_GAP_DAYS);

  // Content belongs to a deal, and a deliverable read without knowing whose it is or
  // which campaign it serves is unusable — so the deal is joined in here rather than
  // being fetched per card.
  const dealById = new Map(getDeals().map((d) => [d.id, d]));
  const campaigns = getCampaigns();
  const campaignById = new Map(campaigns.map((item) => [item.id, item]));
  // The setup checklist is joined in here for the same reason: the affiliate link and
  // coupon code are what make a result measurable, and an item whose tracking doesn't
  // exist yet is not really on schedule however good its dates look.
  const onboarding = getAllOnboardingTasks();
  // Shipments for the same reason again, one step earlier: a creator cannot film what
  // has not arrived, and without this the board reads an unposted parcel as a late draft.
  const shipments = getAllShipments();
  const allRows: ContentRow[] = [];
  for (const item of getAllContentItems()) {
    const deal = dealById.get(item.deal_id);
    if (!deal || (deal.stage !== "agreed" && deal.stage !== "completed")) continue;
    const brief = parseRequirements(
      deal.campaign_id != null ? campaignById.get(deal.campaign_id)?.brief_requirements : null
    );
    allRows.push({
      item,
      dealId: deal.id,
      creator: deal.creator,
      campaign: deal.campaign?.trim() || null,
      platform: resolvePlatform(item, dealPlatforms(deal)),
      blockedBy: blockingSetup(onboarding, deal.id, deal.partner_id),
      awaitingProduct: awaitingShipment(shipments, deal.id),
      requiresCheck: brief.requirements.length > 0 || brief.minIntegrationSeconds != null,
    });
  }

  let rows = allRows;
  if (platform) rows = rows.filter((r) => r.platform === platform);
  if (campaign) rows = rows.filter((r) => r.campaign === campaign);
  const needle = q.trim().toLowerCase();
  if (needle) {
    rows = rows.filter(
      (r) =>
        r.creator.toLowerCase().includes(needle) || r.item.title.toLowerCase().includes(needle)
    );
  }
  if (onlyAttention) rows = rows.filter((r) => needsAttention(r, today, draftLeadDays));

  const attentionCount = allRows.filter((r) => needsAttention(r, today, draftLeadDays)).length;
  const yoursCount = allRows.filter(
    (r) => nextAction(r, today, draftLeadDays).owner === "us"
  ).length;

  const query = (over: Record<string, string>) =>
    buildQuery("/content", params as Record<string, string>, over, { view: "board", dir: "asc" });

  // The board orders itself by urgency inside each column; only the list is sortable.
  const listed = sort
    ? sortBy(
        rows,
        (r) => (sort === "creator" ? r.creator : urgencyScore(r, today)),
        dir as SortDir
      )
    : sortBy(rows, (r) => urgencyScore(r, today), "asc");

  const campaignNames = [
    ...new Set([
      ...allRows.map((r) => r.campaign).filter((n): n is string => Boolean(n)),
      ...campaigns.map((c) => c.name),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Content"
        actions={
          <>
            <div className="flex bg-slate-100 rounded-md p-0.5">
              {[
                { key: "board", label: "Board", icon: "view_kanban" },
                { key: "list", label: "List", icon: "view_list" },
                { key: "calendar", label: "Calendar", icon: "calendar_month" },
              ].map((v) => (
                <Link
                  key={v.key}
                  href={query({ view: v.key })}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-colors ${
                    v.key === view
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    {v.icon}
                  </span>
                  {v.label}
                </Link>
              ))}
            </div>

            <div className="hidden lg:flex gap-1.5">
              {PLATFORM_FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={query({ platform: f.key })}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    platform === f.key
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-200 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </>
        }
      />

      <main className="flex-1 overflow-x-auto overflow-y-auto p-8">
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <form className="flex items-center gap-2" method="get">
            {platform && <input type="hidden" name="platform" value={platform} />}
            {view !== "board" && <input type="hidden" name="view" value={view} />}
            {focus && <input type="hidden" name="focus" value={focus} />}
            {sort && <input type="hidden" name="sort" value={sort} />}
            <input
              name="q"
              defaultValue={q}
              placeholder="Search creator or deliverable…"
              className="border border-slate-200 rounded-lg bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand w-56"
            />
            {campaignNames.length > 0 && (
              <select
                name="campaign"
                defaultValue={campaign}
                className="border border-slate-200 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700"
              >
                <option value="">All campaigns</option>
                {campaignNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <button className="text-xs font-medium bg-slate-900 text-white rounded-md px-3 py-1.5 hover:bg-slate-800">
              Apply
            </button>
          </form>

          {/* The one filter worth a permanent button: everything else narrows the list,
              this one answers "what is actually wrong right now". */}
          <Link
            href={query({ focus: onlyAttention ? "" : "attention" })}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
              onlyAttention
                ? "bg-amber-500 text-white border-amber-500"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              priority_high
            </span>
            {attentionCount} schedule risks
          </Link>

          <span className="text-xs text-slate-500 font-tabular">
            {yoursCount} actions for you · {allRows.length} item
            {allRows.length === 1 ? "" : "s"} total
          </span>

          {(campaign || q || platform || sort || onlyAttention) && (
            <Link
              href={view === "board" ? "/content" : `/content?view=${view}`}
              className="text-xs text-brand-dark font-medium hover:underline"
            >
              Clear filters
            </Link>
          )}
        </div>

        {allRows.length === 0 ? (
          <div className="bg-white rounded-lg border border-dashed border-slate-300 p-10 text-center">
            <p className="text-sm font-medium text-slate-700 mb-1">No content items yet</p>
            <p className="text-sm text-slate-500">
              They appear here when you confirm a contract on a deal, which turns its
              deliverables into trackable items — or add them by hand from a deal&rsquo;s
              Fulfillment tab.
            </p>
          </div>
        ) : view === "list" ? (
          <ContentTable
            rows={listed}
            today={today}
            draftLeadDays={draftLeadDays}
            sort={sort}
            dir={dir as SortDir}
            hrefFor={query}
          />
        ) : view === "calendar" ? (
          <ContentCalendar
            rows={rows}
            month={month}
            today={today}
            draftLeadDays={draftLeadDays}
            minGapDays={minGapDays}
            hrefFor={query}
          />
        ) : (
          <ContentBoard rows={rows} today={today} draftLeadDays={draftLeadDays} />
        )}
      </main>
    </>
  );
}
