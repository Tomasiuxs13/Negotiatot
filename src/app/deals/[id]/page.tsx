import Link from "next/link";
import { notFound } from "next/navigation";
import { ensurePartnerPortalToken, getCampaign, getContractDraft, getDeal, getFollowUpState, getMessages, getNegotiationStyle, getPartner, getPartnerChannels, getPartnerCommunication, getPartnerDeals, getRecordLayout, getPlaybook, getLastRunAt, getRemindersFor, getSetting, getUnitEconomics, getUsageTotals } from "@/lib/db";
import ContactStrip from "@/components/deal/ContactStrip";
import RightsEditor from "@/components/deal/RightsEditor";
import AttachReportBlock from "@/components/deal/AttachReportBlock";
import { parseRights, rightsMismatch } from "@/lib/rights";
import RemindersBlock from "@/components/RemindersBlock";
import type { MeasurementWindows } from "@/lib/measurement";
import { campaignGoalLabel, describeOverrides, parseOverrides } from "@/lib/campaigns";
import { DECLINE_REASON_LABEL, PLATFORM_META, dealPlatforms, dealScope, type Deal, type Message } from "@/lib/types";
import CockpitNumbers from "@/components/deal/CockpitNumbers";
import AffordabilityPanel from "@/components/deal/AffordabilityPanel";
import MetricBand from "@/components/deal/MetricBand";
import DealProgress from "@/components/deal/DealProgress";
import DealWorkspace from "@/components/deal/DealWorkspace";
import AudienceDataEditor from "@/components/deal/AudienceDataEditor";
import { suspectAudienceData } from "@/lib/audience-sanity";
import DeleteDealButton from "@/components/deal/DeleteDealButton";
import CompleteDealButton from "@/components/deal/CompleteDealButton";
import MarkAgreedButton from "@/components/deal/MarkAgreedButton";
import DeclineDealButton from "@/components/deal/DeclineDealButton";
import ReopenDealButton from "@/components/deal/ReopenDealButton";
import ActualsPanel from "@/components/deal/ActualsPanel";
import JobPoller, { JobChip } from "@/components/deal/JobPoller";
import ContractBlock from "@/components/deal/ContractBlock";
import OnboardingBlock from "@/components/deal/OnboardingBlock";
import { ContentItemsBlock, PaymentItemsBlock, ShipmentsBlock } from "@/components/deal/WorkBlocks";
import {
  getContentItems,
  getContract,
  getOnboardingForDeal,
  getPaymentItems,
  getShipments,
  parseTerms,
} from "@/lib/fulfillment";
import { money } from "@/lib/format";
import { actualDealCost, dealCommission, describeCommission, earningsForecast, expectedOrdersFrom, parseTiers, resolveOffer, trueDealCost } from "@/lib/commission";
import { deliverableCount } from "@/lib/deliverables";
import AnalysisTab from "@/components/deal/AnalysisTab";
import NegotiationTab from "@/components/deal/NegotiationTab";
import DealNotes from "@/components/deal/DealNotes";
import { DEAL_STAGE_TONE, TONE_CLASS_BORDERED } from "@/lib/status-tones";
import { usageCostUsd } from "@/lib/usage-cost";
import { parseRequirements } from "@/lib/brief-requirements";
import ContractDraftBlock from "@/components/deal/ContractDraftBlock";
import DealStageBar from "@/components/deal/DealStageBar";
import { getFollowUpCandidate } from "@/lib/followups";
import { outreachStatus } from "@/lib/outreach";
import DealPartnerCard from "@/components/deal/DealPartnerCard";
import PartnerCommunication from "@/components/partners/PartnerCommunication";
import { otherLiveDeals, partnerOperationalStats, partnerStatus, priorDeals } from "@/lib/partners";

export const dynamic = "force-dynamic";

function HistoryTab({ deal, messages }: { deal: Deal; messages: Message[] }) {
  const usage = getUsageTotals(deal.id);
  const estCost = usageCostUsd(usage);
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-headline text-sm font-semibold text-slate-900">Deal history</h3>
        {usage.calls > 0 && (
          <span className="text-xs text-slate-400 font-tabular">
            Copilot usage: {usage.calls} calls · ≈ ${estCost.toFixed(2)}
          </span>
        )}
      </div>
      <div className="divide-y divide-slate-100">
        <div className="flex gap-3 py-2.5 text-xs first:pt-0">
          <span className="text-slate-400 w-14 shrink-0">
            {new Date(deal.created_at + "Z").toLocaleDateString("en", { month: "short", day: "numeric" })}
          </span>
          <span className="text-slate-700">Deal created · {deal.campaign ?? "no campaign"}</span>
        </div>
        {messages.map((message) => (
          <div key={message.id} className="flex gap-3 py-2.5 text-xs last:pb-0">
            <span className="text-slate-400 w-14 shrink-0">
              {new Date(message.created_at + "Z").toLocaleDateString("en", { month: "short", day: "numeric" })}
            </span>
            <span className="text-slate-700">
              {message.sender === "them"
                ? `Message received from ${deal.creator}`
                : message.sender === "us"
                  ? "Offer sent"
                  : `Copilot recommendation · ${message.body}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const found = getDeal(Number(id));
  if (!found) notFound();
  const deal = found;
  const messages = getMessages(deal.id);
  const followUp = getFollowUpCandidate(deal, messages, getFollowUpState(deal.id));
  // Which touch this creator is on, for a stage whose stored label never changes.
  const outreach = outreachStatus(deal, messages);
  const platforms = dealPlatforms(deal);
  const scope = dealScope(deal);
  const contract = getContract(deal.id) ?? null;
  const contentItems = getContentItems(deal.id);
  const paymentItems = getPaymentItems(deal.id);
  const shipments = getShipments(deal.id);
  const onboarding = getOnboardingForDeal(deal.id, deal.partner_id);
  /** Price is settled — the header should report delivery, not the negotiation. */
  const closed = deal.stage === "agreed" || deal.stage === "completed";

  // What the ladder's numbers actually cover, and what the deal really costs — computed
  // on the SAME basis as the engine's prompt: Playbook-fallback pieces, resolved
  // commission (deal override or Playbook default), and the tier rate the forecast
  // volume earns. Using the deal row alone here showed $7,342 on screen while the
  // analysis said $8,764 for the same deal.
  const econ = getUnitEconomics();
  const platformRules = Object.fromEntries(platforms.map((p) => [p, getPlaybook(p)]));
  const ladderPieces = Math.max(
    1,
    deliverableCount({ text: dealScope(deal), platforms, rulesByPlatform: platformRules })
  );
  const ladderOrders =
    expectedOrdersFrom({
      views: deal.avg_views ?? 0,
      linkCtrPct: Number(econ.linkCtr ?? 0),
      orderConversionPct: Number(econ.orderConversion ?? 0),
    }) * ladderPieces;
  const offer = resolveOffer(deal, econ);
  const styleTiers = parseTiers(
    ((getNegotiationStyle()?.commissionTiers as string[] | undefined) ?? []).map(String)
  );
  // Affordability, computed here rather than read off the analysis so the panel is
  // right even before an analysis has ever run, and stays right after the Playbook
  // changes. Same inputs the ladder's cost note uses, so the two cannot disagree.
  const costOrders = closed && deal.actual_orders != null ? deal.actual_orders : ladderOrders;
  const costFee = closed
    ? (deal.agreed_price ?? deal.current_offer ?? deal.target ?? 0)
    : (deal.target ?? 0);
  const productCost = shipments.length > 0 ? Number(econ.productCost ?? 0) : 0;
  const dealCost = closed
    ? actualDealCost({
        fee: costFee,
        actualOrders: costOrders,
        actualRevenue: deal.actual_revenue,
        aov: Number(econ.aov ?? 0),
        commission: offer.commission,
        discount: offer.discount,
        tiers: styleTiers,
        productCost,
      })
    : (() => {
        const costRate = earningsForecast({
          expectedOrders: costOrders,
          commission: offer.commission,
          aov: Number(econ.aov ?? 0),
          discount: offer.discount,
          tiers: styleTiers,
        }).perOrder;
        return trueDealCost({
          fee: costFee,
          expectedOrders: costOrders,
          aov: Number(econ.aov ?? 0),
          commission: { type: "per_order", value: costRate },
          discount: offer.discount,
          productCost,
        });
      })();
  /** Widest cap among this deal's platforms — a crosspost isn't capped at the strictest. */
  const maxPerDeal = (() => {
    const caps = platforms
      .map((pf) => Number((platformRules[pf] as Record<string, unknown> | null)?.maxPerDeal ?? 0))
      .filter((n) => n > 0);
    return caps.length > 0 ? Math.max(...caps) : null;
  })();

  /** Parsed once here so the metric band can sit above the tabs. */
  const parsedAnalysis = (() => {
    if (!deal.analysis) return null;
    try {
      return JSON.parse(deal.analysis) as import("@/lib/types").DealAnalysis;
    } catch {
      return null;
    }
  })();

  const showFulfillment =
    closed ||
    contract != null ||
    contentItems.length > 0 ||
    paymentItems.length > 0 ||
    shipments.length > 0;

  const channels = deal.partner_id != null ? getPartnerChannels(deal.partner_id) : [];

  // This creator's typical reach per platform — how a bundle fee gets attributed.
  const expectedReach = Object.fromEntries(
    channels.filter((c) => c.avg_views != null).map((c) => [c.platform, c.avg_views as number])
  );

  /** Follower count for this deal's platform, used to sanity-check the view figure. */
  const followers = channels.find((c) => c.platform === deal.platform)?.followers ?? null;

  const workDone = (() => {
    const unverified = contentItems.filter((c) => c.status !== "verified").length;
    const unpaid = paymentItems.filter((p) => p.status !== "paid").length;
    const undelivered = shipments.filter((shipment) => shipment.status !== "delivered").length;
    const open: string[] = [];
    if (unverified > 0) open.push(`${unverified} content item${unverified === 1 ? "" : "s"} not verified`);
    if (unpaid > 0) open.push(`${unpaid} payment${unpaid === 1 ? "" : "s"} not paid`);
    if (undelivered > 0) open.push(`${undelivered} shipment${undelivered === 1 ? "" : "s"} not delivered`);
    return {
      ready:
        open.length === 0 &&
        (contentItems.length > 0 || paymentItems.length > 0 || shipments.length > 0),
      openWork: open.length > 0 ? `Still open: ${open.join(", ")}.` : "Nothing tracked on this deal yet.",
    };
  })();

  // Which record layout to draw. A setting, so switching back is a click in Settings
  // rather than a deploy — see record-layout.ts.
  const workspace = getRecordLayout() === "workspace";

  /**
   * The associated record: who this deal is with. Everything here was already computed
   * somewhere in the app — the intake form has used it for years to recognise a
   * returning creator — but the deal page itself never showed any of it.
   */
  const partnerRecord = deal.partner_id != null ? getPartner(deal.partner_id) : undefined;
  const partnerCard = (() => {
    if (!partnerRecord) return null;
    const partnerDeals = getPartnerDeals(partnerRecord.id);
    const history = priorDeals(partnerDeals, deal.id);
    const last = history[0] ?? null;
    const operations = partnerOperationalStats(
      partnerDeals,
      partnerDeals.flatMap((d) => getContentItems(d.id))
    );
    return (
      <DealPartnerCard
        partnerId={partnerRecord.id}
        name={partnerRecord.name}
        category={partnerRecord.category ?? null}
        email={partnerRecord.email}
        status={partnerStatus(partnerDeals)}
        priorCount={history.length}
        lastAgreedPrice={last?.agreedPrice ?? null}
        lastDealDate={last?.date ?? null}
        lastActualCpm={last?.actualCpm ?? null}
        onTimeRate={operations.onTimeRate}
        promisedContent={operations.promisedContent}
        deliveredContent={operations.deliveredContent}
        otherLive={otherLiveDeals(partnerDeals, deal.id).map((d) => ({
          id: d.id,
          stage: d.stage,
          label: d.status_label,
        }))}
      />
    );
  })();

  const campaign = deal.campaign_id != null ? getCampaign(deal.campaign_id) : undefined;
  const campaignOverrides = campaign ? describeOverrides(parseOverrides(campaign.overrides)) : [];
  /** The campaign brief's checkable obligations, for grading posted videos. */
  const briefReqs = parseRequirements(campaign?.brief_requirements);
  const analyzedAt = getLastRunAt(deal.id, "analysis");
  const playbookUpdatedAt = getSetting<string>("playbook_updated_at");
  const hasMeasurableContent = contentItems.some(
    (item) =>
      item.status === "posted" ||
      item.status === "verified" ||
      item.posted_at != null ||
      item.actual_views != null
  );

  // Who this is. Shared by both record layouts — the workspace column and the classic
  // full-width cockpit show the same block, in different places.
  const identity = (
    // Sized against its own column, not the window: the same block sits in a ~290px
    // properties column and in a ~430px cockpit cell, and a handle like
    // "TheOldCoupleOutdoors" at 24px overflows the narrow one.
    <div className="@container flex items-start gap-3 @sm:gap-4 min-w-0">
        <div className="w-11 h-11 @sm:w-16 @sm:h-16 rounded-lg bg-brand/10 text-brand-dark flex items-center justify-center font-bold text-lg @sm:text-2xl shrink-0">
          {deal.creator.charAt(0)}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          {deal.partner_id != null ? (
            <Link
              href={`/partners/${deal.partner_id}`}
              className="font-headline text-base @sm:text-2xl font-semibold text-slate-900 tracking-tight [overflow-wrap:anywhere] hover:text-brand"
            >
              {deal.creator}
            </Link>
          ) : (
            <h1 className="font-headline text-base @sm:text-2xl font-semibold text-slate-900 tracking-tight [overflow-wrap:anywhere]">
              {deal.creator}
            </h1>
          )}
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 rounded-full px-2 py-0.5 flex items-center gap-1">
              {platforms.map((pf) => (
                <span key={pf} className="flex items-center gap-0.5">
                  <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                    {PLATFORM_META[pf].icon}
                  </span>
                  {PLATFORM_META[pf].label}
                </span>
              ))}
            </span>
            {dealCommission(deal).type !== "none" && (
              <span
                className="text-[11px] font-semibold bg-sky-50 text-sky-700 rounded-full px-2 py-0.5"
                title="Paid on top of the fixed fee — the fee is priced net of this"
              >
                + {describeCommission(dealCommission(deal))}
              </span>
            )}
            {(campaign?.name ?? deal.campaign) && (
              <span
                className="max-w-full truncate rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700"
                title={
                  campaignOverrides.length > 0
                    ? `Campaign overrides — ${campaignOverrides.join(" · ")}`
                    : undefined
                }
              >
                {campaign?.name ?? deal.campaign}
                {campaign && campaignGoalLabel(campaign) ? ` · ${campaignGoalLabel(campaign)}` : ""}
                {campaignOverrides.length > 0
                  ? ` · ${campaignOverrides.length} override${campaignOverrides.length > 1 ? "s" : ""}`
                  : ""}
              </span>
            )}
            {deal.round > 0 && !closed && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE_CLASS_BORDERED[DEAL_STAGE_TONE[deal.stage]]}`}>
                Round {deal.round}
              </span>
            )}
            {deal.job_status && (
              <JobChip
                label={deal.job_status === "analyzing" ? "Analyzing…" : "Copilot drafting…"}
              />
            )}
          </div>
          {scope && (
            <p className="line-clamp-3 text-xs leading-relaxed text-slate-500" title={scope}>
              {scope}
            </p>
          )}
        </div>
    </div>
  );

  return (
    <main className="flex-1 overflow-y-auto">
      <JobPoller active={deal.job_status != null || contract?.status === "parsing"} />

      <DealWorkspace
        defaultTab={
          ({ analysis: "Analysis", negotiation: "Negotiation", communication: "Communication", fulfillment: "Fulfillment", actuals: "Actuals", history: "History" } as Record<string, string>)[tab ?? ""] ??
          (deal.stage === "agreed"
            ? "Fulfillment"
            : deal.stage === "negotiating" || deal.stage === "offer_sent"
              ? "Negotiation"
              : "Analysis")
        }
        breadcrumb={
          <nav className="text-[13px] font-medium text-slate-500">
            <Link href="/pipeline" className="hover:text-brand transition-colors">
              Pipeline
            </Link>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="text-slate-900">{deal.creator}</span>
          </nav>
        }
        actions={
          <>
            {deal.stage === "agreed" && (
              <CompleteDealButton
                dealId={deal.id}
                ready={workDone.ready}
                openWork={workDone.openWork}
              />
            )}
            {!closed && deal.stage !== "declined" && (
              <MarkAgreedButton
                dealId={deal.id}
                price={deal.current_offer ?? deal.current_ask}
              />
            )}
            {deal.stage === "declined" ? (
              <ReopenDealButton dealId={deal.id} />
            ) : null}
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                More
                <span className="material-symbols-outlined" style={{ fontSize: 15 }}>expand_more</span>
              </summary>
              <div className="absolute right-0 top-full z-40 mt-2 flex min-w-44 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
                {!closed && deal.stage !== "declined" && <DeclineDealButton dealId={deal.id} />}
                <DeleteDealButton dealId={deal.id} creator={deal.creator} />
              </div>
            </details>
          </>
        }
        workflow={<DealStageBar dealId={deal.id} stage={deal.stage} note={outreach?.line} />}
        cockpit={
          <>
        {deal.job_error && !deal.job_status && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {deal.job_error}
          </div>
        )}

        {deal.stage === "declined" ? (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-sm font-semibold text-slate-900">
                Declined
                {deal.decline_reason
                  ? ` — ${DECLINE_REASON_LABEL[deal.decline_reason].toLowerCase()}`
                  : ""}
              </span>
              {deal.declined_at && (
                <span className="text-xs text-slate-400 font-tabular">{deal.declined_at}</span>
              )}
              {deal.revisit_on && (
                <span className="text-xs font-medium text-brand-dark">
                  · revisit on {deal.revisit_on}
                </span>
              )}
            </div>
            {deal.decline_note && <p className="text-sm text-slate-600 mt-1">{deal.decline_note}</p>}
            {deal.current_ask != null && deal.walkaway != null && (
              <p className="text-xs text-slate-400 mt-1.5 font-tabular">
                Their last position {money(deal.current_ask)} · your walk-away{" "}
                {money(deal.walkaway)}
              </p>
            )}
          </section>
        ) : closed ? (
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <DealProgress
              deal={deal}
              contentItems={contentItems}
              paymentItems={paymentItems}
              aov={Number(econ.aov ?? 0)}
              productCost={productCost}
              commission={offer.commission}
              discount={offer.discount}
              commissionTiers={styleTiers}
            />
          </section>
        ) : (
          /* The cockpit: who this is, what the numbers are, and whether we can afford
             it — the three things needed to decide an offer, side by side rather than
             stacked down the page with the money furthest from the identity.
             The workspace layout shows the same three in its properties column instead,
             so this band would be a duplicate there. */
          <section className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 md:grid-cols-12 gap-6 xl:gap-8 items-start${workspace ? " hidden" : ""}`}>
            <div className="md:col-span-6 xl:col-span-4 min-w-0">{identity}</div>

            <div className="md:col-span-6 xl:col-span-4 min-w-0">
              <CockpitNumbers deal={deal} />
            </div>

            <div className="md:col-span-12 xl:col-span-4 min-w-0">
              <AffordabilityPanel
                totalCost={dealCost.total}
                fee={costFee}
                maxPerDeal={maxPerDeal}
                breakeven={deal.breakeven}
              />
            </div>
          </section>
        )}
          </>
        }
        band={
          parsedAnalysis && parsedAnalysis.metrics.length > 0 ? (
            <MetricBand metrics={parsedAnalysis.metrics} />
          ) : undefined
        }
        about={
          workspace ? (
            <>
              {/* What the deal IS, kept on screen while the middle column changes: who,
                  the four numbers, what it costs, and what it was priced from. */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                {identity}
                {!closed && deal.stage !== "declined" && (
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <CockpitNumbers deal={deal} />
                  </div>
                )}
              </div>
              {!closed && deal.stage !== "declined" && (
                <AffordabilityPanel
                  totalCost={dealCost.total}
                  fee={costFee}
                  maxPerDeal={maxPerDeal}
                  breakeven={deal.breakeven}
                />
              )}
              <AudienceDataEditor
                dealId={deal.id}
                avgViews={deal.avg_views}
                engagementRate={deal.engagement_rate}
                suspect={suspectAudienceData({ avgViews: deal.avg_views, followers })}
              />
              <RightsEditor dealId={deal.id} rightsJson={deal.rights ?? null} />
            </>
          ) : undefined
        }
        rail={
          <>
            {/* Reference data and private context, visible from every tab — a note or a
                promise like "ask again in three months" shouldn't hide behind whichever
                tab happened to be open. In the workspace layout this column is the
                related-record side: who the deal is with comes first. */}
            {workspace && partnerCard}
            {!workspace && (
              <AudienceDataEditor
                dealId={deal.id}
                avgViews={deal.avg_views}
                engagementRate={deal.engagement_rate}
                suspect={suspectAudienceData({ avgViews: deal.avg_views, followers })}
              />
            )}
            {!workspace && <RightsEditor dealId={deal.id} rightsJson={deal.rights ?? null} />}
            {deal.analysis && <AttachReportBlock dealId={deal.id} />}
            <DealNotes dealId={deal.id} initialNotes={deal.notes ?? ""} />
            <RemindersBlock
              reminders={getRemindersFor({ dealId: deal.id })}
              dealId={deal.id}
              partnerId={deal.partner_id ?? undefined}
            />
          </>
        }
        tabs={[
          { name: "Analysis", node: (
              <AnalysisTab
                deal={deal}
                analyzedAt={analyzedAt}
                playbookUpdatedAt={playbookUpdatedAt}
                hasMessage={messages.some((m) => m.sender === "them")}
              />
            ) },
          { name: "Negotiation", node: <NegotiationTab deal={deal} messages={messages} followUp={followUp} /> },
          // What has actually been said to this creator, across every deal with them —
          // the same panel their profile carries. The Negotiation tab is this deal's
          // thread as bubbles; this is the correspondence, with subjects, Gmail
          // provenance and the deal each message belongs to.
          ...(deal.partner_id != null
            ? [{
                name: "Communication",
                node: (
                  <PartnerCommunication
                    partnerName={partnerRecord?.name ?? deal.creator}
                    messages={getPartnerCommunication(deal.partner_id)}
                  />
                ),
              }]
            : []),
          ...(showFulfillment
            ? [{ name: "Fulfillment", node: (
                <div className="space-y-4 max-w-4xl">
                  {!closed && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                      <p className="text-xs font-semibold text-amber-900">
                        Fulfillment is locked because this deal is not Agreed
                      </p>
                      <p className="text-xs text-amber-800 mt-1">
                        These records were created before the deal was won. Move the deal to Agreed
                        to continue, or delete the records if they do not belong here.
                      </p>
                    </div>
                  )}
                  {/* Who to talk to, above the work about them. Every attention item
                      that says "check in with the creator" lands on this tab, so their
                      email and portal link have to be here, not on the partner page. */}
                  {(() => {
                    const partner = deal.partner_id != null ? getPartner(deal.partner_id) : null;
                    return (
                      <ContactStrip
                        creator={deal.creator}
                        email={partner?.email ?? null}
                        portalPath={
                          partner ? `/portal/${ensurePartnerPortalToken(partner.id)}` : null
                        }
                      />
                    );
                  })()}
                  {/* Fulfillment is a sequence, not a pile: finished phases fold to a
                      checkmark line so the current one is what the eye lands on. */}
                  <details id="paperwork" open={contract?.status !== "confirmed"} className="group scroll-mt-28">
                    <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-semibold text-slate-700 py-1 select-none">
                      <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
                      1 · Paperwork
                      {contract?.status === "confirmed" && (
                        <span className="text-xs font-normal text-emerald-700">✓ contract confirmed</span>
                      )}
                    </summary>
                    <div className="space-y-4 mt-2">
                      {/* The contract checked against what the deal was priced for. The
                          parser has always extracted usage and exclusivity — but only
                          after signing, which is exactly too late to affect the price.
                          This is where the two ends finally meet. */}
                      {(() => {
                        const terms = parseTerms(contract?.parsed_terms);
                        if (!terms) return null;
                        const warnings = rightsMismatch(parseRights(deal.rights), terms);
                        if (warnings.length === 0) return null;
                        return (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs font-semibold text-amber-900 mb-1">
                              Contract and pricing disagree about rights
                            </p>
                            <ul className="space-y-1">
                              {warnings.map((w) => (
                                <li key={w} className="text-xs text-amber-800">
                                  {w}
                                </li>
                              ))}
                            </ul>
                            <p className="text-[11px] text-amber-700 mt-1.5">
                              Fix the contract, or update Rights &amp; extras and re-analyze
                              before confirming.
                            </p>
                          </div>
                        );
                      })()}
                      <ContractDraftBlock
                        dealId={deal.id}
                        initial={(() => {
                          const d = getContractDraft(deal.id);
                          return d ? { body: d.body, status: d.status } : null;
                        })()}
                      />
                      <ContractBlock
                        dealId={deal.id}
                        contract={contract}
                        terms={parseTerms(contract?.parsed_terms)}
                      />
                    </div>
                  </details>

                  {(() => {
                    const contentDone =
                      contentItems.length > 0 && contentItems.every((c) => c.status === "verified");
                    const shipDone = shipments.every((x) => x.status === "delivered");
                    const onboardingDone = onboarding.every((t) => t.status === "done");
                    const phaseDone = contentDone && shipDone && onboardingDone;
                    return (
                      <details id="setup-content" open={!phaseDone} className="group scroll-mt-28">
                        <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-semibold text-slate-700 py-1 select-none">
                          <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
                          2 · Setup &amp; content
                          {phaseDone && (
                            <span className="text-xs font-normal text-emerald-700">✓ all delivered and verified</span>
                          )}
                        </summary>
                        <div className="space-y-4 mt-2">
                          <OnboardingBlock
                            dealId={deal.id}
                            creator={deal.creator}
                            tasks={onboarding}
                            hasPartner={deal.partner_id != null}
                            senderName={(getSetting<Record<string, string>>("brand_profile")?.senderName ?? "")}
                            brandName={(getSetting<Record<string, string>>("brand_profile")?.brandName ?? "")}
                            portalPath={
                              deal.partner_id != null
                                ? `/portal/${ensurePartnerPortalToken(deal.partner_id)}`
                                : null
                            }
                            locked={!closed}
                          />
                          <ContentItemsBlock
                            dealId={deal.id}
                            items={contentItems}
                            draftLeadDays={Number(
                              getSetting<Record<string, number>>("workflow")?.draftLeadDays ?? 10
                            )}
                            creator={deal.creator}
                            senderName={(getSetting<Record<string, string>>("brand_profile")?.senderName ?? "")}
                            requirements={briefReqs.requirements}
                            minIntegrationSeconds={briefReqs.minIntegrationSeconds}
                            platforms={platforms}
                            portalPath={
                              deal.partner_id != null
                                ? `/portal/${ensurePartnerPortalToken(deal.partner_id)}`
                                : null
                            }
                            locked={!closed}
                          />
                          <ShipmentsBlock dealId={deal.id} shipments={shipments} locked={!closed} />
                        </div>
                      </details>
                    );
                  })()}

                  <details open={paymentItems.some((x) => x.status !== "paid") || paymentItems.length === 0} className="group">
                    <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-semibold text-slate-700 py-1 select-none">
                      <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
                      3 · Money
                      {paymentItems.length > 0 && paymentItems.every((x) => x.status === "paid") && (
                        <span className="text-xs font-normal text-emerald-700">✓ everything paid</span>
                      )}
                    </summary>
                    <div className="mt-2">
                      <PaymentItemsBlock dealId={deal.id} payments={paymentItems} locked={!closed} />
                    </div>
                  </details>
                </div>
              ) }]
            : []),
          ...(closed || deal.agreed_price != null || hasMeasurableContent
            ? [{ name: "Actuals", node: (
                <ActualsPanel
                  deal={deal}
                  contentItems={contentItems}
                  expectedReach={expectedReach}
                  windows={getSetting<MeasurementWindows>("measurement_windows") ?? {}}
                  finance={{
                    aov: Number(econ.aov ?? 0),
                    commission: offer.commission,
                    discount: offer.discount,
                    commissionTiers: styleTiers,
                    productCost: shipments.length > 0 ? Number(econ.productCost ?? 0) : 0,
                  }}
                  goal={campaign?.primary_kpi ? {
                    objective: campaign.objective,
                    primaryKpi: campaign.primary_kpi,
                    target: campaign.kpi_target,
                  } : null}
                />
              ) }]
            : []),
          { name: "History", node: <HistoryTab deal={deal} messages={messages} /> },
        ]}
      />
    </main>
  );
}
