import Link from "next/link";
import PageHeader, { NewDealButton } from "@/components/PageHeader";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import DealsTable from "@/components/pipeline/DealsTable";
import { getCampaigns, getDeals, getFollowUpMessages, getPartnerIdentities } from "@/lib/db";
import {
  getAllContentItems,
  getAllOnboardingTasks,
  getAllPaymentItems,
  getAllShipments,
} from "@/lib/fulfillment";
import { dealPhase, type DealPhase } from "@/lib/deal-phase";
import { outreachStatus } from "@/lib/outreach";
import { creatorSearchFields, handleAddsIdentity, handleForDeal } from "@/lib/creator-label";
import { scoreMatch } from "@/lib/search";
import { STAGES, STAGE_HELP, dealPlatforms, type Message } from "@/lib/types";
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
  // Who each creator is, beyond the name typed on the deal.
  const identities = getPartnerIdentities();
  const handleOf = (deal: { partner_id: number | null; platform: string | null }) =>
    deal.partner_id != null
      ? handleForDeal(deal.platform, identities.get(deal.partner_id)?.channels ?? [])
      : null;

  const needle = q.trim();
  if (needle) {
    // Handle and email included on purpose: they are what an imported card and an email
    // thread actually show you, and searching either used to return an empty board.
    deals = deals.filter(
      (d) =>
        scoreMatch(
          needle,
          creatorSearchFields(d, handleOf(d), d.partner_id != null ? identities.get(d.partner_id)?.email ?? null : null)
        ) > 0
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

  // What has actually been sent to a creator we contacted, and when. "Reached out ·
  // awaiting reply" read the same on day one and day thirty and never mentioned the
  // chases already sent; this replaces it with "Follow-up 2 · 3d ago".
  const outreach: Record<number, string> = {};
  if (deals.some((d) => d.stage === "contacted")) {
    const threads = new Map<number, Message[]>();
    for (const message of getFollowUpMessages()) {
      const thread = threads.get(message.deal_id);
      if (thread) thread.push(message);
      else threads.set(message.deal_id, [message]);
    }
    for (const d of deals) {
      const status = outreachStatus(d, threads.get(d.id) ?? []);
      if (status) outreach[d.id] = status.line;
    }
  }

  // "@_morgan.miles_" under a card that says "Mo" — shown only when it tells you
  // something the name does not.
  const handles: Record<number, string> = {};
  for (const d of deals) {
    const handle = handleOf(d);
    if (handle && handleAddsIdentity(d.creator, handle)) handles[d.id] = handle;
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
        subtitle="Move every collaboration from first contact to delivery"
        actions={<NewDealButton />}
      />

      <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6">
        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">How deals move</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                Use the <span className="font-semibold text-slate-700">Move to</span> menu on any card. Dragging is still available as a shortcut.
              </p>
            </div>
            <Link href="/pipeline?view=list" className="hidden text-xs font-semibold text-brand-dark hover:underline sm:block">
              See all as a list
            </Link>
          </div>
          <ol className="flex gap-2 overflow-x-auto pb-1" aria-label="Pipeline stages">
            {STAGES.map((item, index) => {
              const count = all.filter((deal) => deal.stage === item.key).length;
              return (
                <li key={item.key} className="flex min-w-40 flex-1 items-center gap-2">
                  <Link
                    href={query({ stage: item.key })}
                    className={`min-w-0 flex-1 rounded-lg border px-3 py-2 transition-colors ${
                      stage === item.key
                        ? "border-brand bg-brand-soft"
                        : "border-slate-200 bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-800">{item.label}</span>
                      <span className="font-data text-xs text-slate-500">{count}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                      {STAGE_HELP[item.key].description}
                    </span>
                  </Link>
                  {index < STAGES.length - 1 && (
                    <span className="material-symbols-outlined shrink-0 text-slate-300" style={{ fontSize: 14 }} aria-hidden>
                      chevron_right
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 rounded-md p-0.5" aria-label="Pipeline view">
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
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={query({ platform: f.key })}
                  className={`whitespace-nowrap text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    platform === f.key
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-200 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
          </div>

          <form className="flex w-full min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-nowrap lg:w-auto" method="get">
            {platform && <input type="hidden" name="platform" value={platform} />}
            {view !== "board" && <input type="hidden" name="view" value={view} />}
            {stage && <input type="hidden" name="stage" value={stage} />}
            {sort && <input type="hidden" name="sort" value={sort} />}
            <input
              name="q"
              defaultValue={q}
              placeholder="Search creator, handle, email…"
              className="min-w-48 flex-1 border border-slate-200 rounded-lg bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand sm:w-56 sm:flex-none"
            />
            {campaignNames.length > 0 && (
              <select
                name="campaign"
                defaultValue={campaign}
                className="min-w-44 flex-1 border border-slate-200 rounded-lg bg-white px-2 py-1.5 text-xs text-slate-700 sm:flex-none"
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
            <div className="flex basis-full items-center justify-end gap-2 text-sm">
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
          <DealsTable deals={listed} phases={phases} outreach={outreach} handles={handles} sort={sort} dir={dir as SortDir} hrefFor={query} />
        ) : (
          <PipelineBoard
            key={deals.map((deal) => `${deal.id}:${deal.stage}:${deal.updated_at}`).join("|")}
            deals={deals}
            phases={phases}
            outreach={outreach}
            handles={handles}
          />
        )}

      </main>
    </>
  );
}
