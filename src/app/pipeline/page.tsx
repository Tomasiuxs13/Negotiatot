import Link from "next/link";
import PageHeader, { NewDealButton } from "@/components/PageHeader";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import DealsTable from "@/components/pipeline/DealsTable";
import { getCampaigns, getDeals } from "@/lib/db";
import {
  getAllContentItems,
  getAllOnboardingTasks,
  getAllPaymentItems,
  getAllShipments,
} from "@/lib/fulfillment";
import { dealPhase, type DealPhase } from "@/lib/deal-phase";
import { dealPlatforms } from "@/lib/types";
import { buildQuery, sortBy, type SortDir } from "@/lib/table-sort";

export const dynamic = "force-dynamic";

/** A deal's campaign, whether it came from a linked record or was typed in. */
function campaignNameOf(d: { campaign: string | null }): string | null {
  return d.campaign?.trim() || null;
}

const FILTERS = [
  { key: "", label: "All" },
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{
    platform?: string;
    view?: string;
    stage?: string;
    campaign?: string;
    q?: string;
    sort?: string;
    dir?: string;
  }>;
}) {
  const params = await searchParams;
  const {
    platform = "",
    view = "board",
    stage = "",
    campaign = "",
    q = "",
    sort = "",
    dir = "desc",
  } = params;
  const isList = view === "list";

  const all = getDeals();
  let deals = platform
    ? all.filter((d) => dealPlatforms(d).includes(platform as never))
    : all;
  if (stage) deals = deals.filter((d) => d.stage === stage);
  // Matched by name: deals carry the campaign as text and may never have been linked to
  // a campaign record, so filtering on the id alone would silently match nothing.
  if (campaign) deals = deals.filter((d) => campaignNameOf(d) === campaign);
  const needle = q.trim().toLowerCase();
  if (needle) {
    deals = deals.filter(
      (d) =>
        d.creator.toLowerCase().includes(needle) ||
        (d.deliverables ?? "").toLowerCase().includes(needle)
    );
  }

  // Where the work actually stands on signed deals — computed, because a deal is
  // routinely mid-setup and mid-production at once and no single column says that.
  const onboarding = getAllOnboardingTasks();
  const contentItems = getAllContentItems();
  const payments = getAllPaymentItems();
  const shipments = getAllShipments();
  const phases: Record<number, DealPhase> = {};
  for (const d of deals) {
    // Only live work has a phase. On a wrapped-up deal, "ready to wrap" is wrong and an
    // unfinished setup step is history, not a task.
    if (d.stage !== "agreed") continue;
    phases[d.id] = dealPhase({
      dealId: d.id,
      partnerId: d.partner_id,
      onboarding,
      shipments,
      contentItems,
      payments,
    });
  }

  const query = (over: Record<string, string>) =>
    buildQuery("/pipeline", params as Record<string, string>, over, { view: "board", dir: "desc" });

  // The board keeps its own order (by stage); only the list is sortable.
  const listed = sort
    ? sortBy(
        deals,
        (d) =>
          sort === "value"
            ? (d.agreed_price ?? d.current_offer)
            : sort === "ask"
              ? d.current_ask
              : sort === "creator"
                ? d.creator
                : d.updated_at,
        dir as SortDir
      )
    : deals;

  // Every campaign that actually appears on a deal, plus any configured ones.
  const campaignNames = [
    ...new Set([
      ...all.map(campaignNameOf).filter((n): n is string => Boolean(n)),
      ...getCampaigns().map((c) => c.name),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Every deal and where it stands"
        actions={
          <>
            {/* View toggle — same deals, two ways to read them. */}
            <div className="flex bg-slate-100 rounded-md p-0.5">
              {[
                { key: "board", label: "Board", icon: "view_kanban" },
                { key: "list", label: "List", icon: "view_list" },
              ].map((v) => (
                <Link
                  key={v.key}
                  href={query({ view: v.key })}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-colors ${
                    (v.key === "list") === isList
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
              {FILTERS.map((f) => (
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
            <NewDealButton />
          </>
        }
      />

      <main className="flex-1 overflow-x-auto overflow-y-auto p-8">
        <div className="mb-4 flex items-center gap-3 flex-wrap">
          <form className="flex items-center gap-2" method="get">
            {platform && <input type="hidden" name="platform" value={platform} />}
            {view !== "board" && <input type="hidden" name="view" value={view} />}
            {stage && <input type="hidden" name="stage" value={stage} />}
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

          {(stage || campaign || q || platform || sort) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-xs text-slate-500">
                {deals.length} of {all.length} deals
                {stage ? " · one stage" : ""}
              </span>
              <Link
                href={view === "list" ? "/pipeline?view=list" : "/pipeline"}
                className="text-xs text-brand-dark font-medium hover:underline"
              >
                Clear filters
              </Link>
            </div>
          )}
        </div>
        {isList ? (
          <DealsTable deals={listed} phases={phases} sort={sort} dir={dir as SortDir} hrefFor={query} />
        ) : (
          <PipelineBoard
            key={deals.map((deal) => `${deal.id}:${deal.stage}:${deal.updated_at}`).join("|")}
            deals={deals}
            phases={phases}
          />
        )}

        {/* The board has no Declined column by design, but the deals must stay
            findable — "where did that deal go" should have a visible answer. */}
        {!isList && all.some((d) => d.stage === "declined") && (
          <div className="mt-4">
            <Link
              href="/pipeline?view=list&stage=declined"
              className="text-xs text-slate-500 hover:text-slate-800 underline underline-offset-2"
            >
              {all.filter((d) => d.stage === "declined").length} declined deal
              {all.filter((d) => d.stage === "declined").length === 1 ? "" : "s"} — view with
              reasons and revisit dates →
            </Link>
          </div>
        )}
      </main>
    </>
  );
}
