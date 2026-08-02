import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign, getContractDraft, getDeal, getMessages, getNegotiationStyle, getPartnerChannels, getPlaybook, getLastRunAt, getRemindersFor, getSetting, getUsageTotals } from "@/lib/db";
import RemindersBlock from "@/components/RemindersBlock";
import type { MeasurementWindows } from "@/lib/measurement";
import { describeOverrides, parseOverrides } from "@/lib/campaigns";
import { DECLINE_REASON_LABEL, PLATFORM_META, STAGE_LABELS, dealPlatforms, dealScope } from "@/lib/types";
import CockpitNumbers from "@/components/deal/CockpitNumbers";
import AffordabilityPanel from "@/components/deal/AffordabilityPanel";
import MetricBand from "@/components/deal/MetricBand";
import DealProgress from "@/components/deal/DealProgress";
import DealWorkspace from "@/components/deal/DealWorkspace";
import AudienceDataEditor from "@/components/deal/AudienceDataEditor";
import { suspectAudienceData } from "@/lib/audience-sanity";
import DeleteDealButton from "@/components/deal/DeleteDealButton";
import CompleteDealButton from "@/components/deal/CompleteDealButton";
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
import { dealCommission, describeCommission, earningsForecast, expectedOrdersFrom, parseTiers, resolveOffer, trueDealCost } from "@/lib/commission";
import { deliverableCount } from "@/lib/deliverables";
import { ladderNotes } from "@/lib/ladder-notes";
import AnalysisTab from "@/components/deal/AnalysisTab";
import NegotiationTab from "@/components/deal/NegotiationTab";
import DealNotes from "@/components/deal/DealNotes";
import { DEAL_STAGE_TONE, TONE_CLASS_BORDERED } from "@/lib/status-tones";
import { PAGE_WIDTH } from "@/lib/layout";
import { usageCostUsd } from "@/lib/usage-cost";
import { parseRequirements } from "@/lib/brief-requirements";
import ContractDraftBlock from "@/components/deal/ContractDraftBlock";

export const dynamic = "force-dynamic";



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
  const econ = getSetting<Record<string, number>>("unit_economics") ?? {};
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
  const ladderRate = earningsForecast({
    expectedOrders: ladderOrders,
    commission: offer.commission,
    aov: Number(econ.aov ?? 0),
    discount: offer.discount,
    tiers: styleTiers,
  }).perOrder;
  const ladder = ladderNotes({
    targetFee: deal.target,
    pieces: ladderPieces,
    scopeText: dealScope(deal),
    expectedOrders: ladderOrders,
    aov: Number(econ.aov ?? 0),
    commission: { type: "per_order", value: ladderRate },
    discount: offer.discount,
    productCost: Number(econ.productCost ?? 0),
  });
  // Affordability, computed here rather than read off the analysis so the panel is
  // right even before an analysis has ever run, and stays right after the Playbook
  // changes. Same inputs the ladder's cost note uses, so the two cannot disagree.
  const dealCost = trueDealCost({
    fee: deal.target ?? 0,
    expectedOrders: ladderOrders,
    aov: Number(econ.aov ?? 0),
    commission: { type: "per_order", value: ladderRate },
    discount: offer.discount,
    productCost: Number(econ.productCost ?? 0),
  });
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
    deal.stage === "agreed" ||
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
    const open: string[] = [];
    if (unverified > 0) open.push(`${unverified} content item${unverified === 1 ? "" : "s"} not verified`);
    if (unpaid > 0) open.push(`${unpaid} payment${unpaid === 1 ? "" : "s"} not paid`);
    return {
      ready: open.length === 0 && (contentItems.length > 0 || paymentItems.length > 0),
      openWork: open.length > 0 ? `Still open: ${open.join(", ")}.` : "Nothing tracked on this deal yet.",
    };
  })();

  const campaign = deal.campaign_id != null ? getCampaign(deal.campaign_id) : undefined;
  const campaignOverrides = campaign ? describeOverrides(parseOverrides(campaign.overrides)) : [];
  /** The campaign brief's checkable obligations, for grading posted videos. */
  const briefReqs = parseRequirements(campaign?.brief_requirements);

  function HistoryTab() {
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
          {messages.map((m) => (
            <div key={m.id} className="flex gap-3 py-2.5 text-xs last:pb-0">
              <span className="text-slate-400 w-14 shrink-0">
                {new Date(m.created_at + "Z").toLocaleDateString("en", { month: "short", day: "numeric" })}
              </span>
              <span className="text-slate-700">
                {m.sender === "them"
                  ? `Message received from ${deal.creator}`
                  : m.sender === "us"
                    ? "Offer sent"
                    : `Copilot recommendation · ${m.body}`}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto">
      <JobPoller active={deal.job_status != null || contract?.status === "parsing"} />

      <DealWorkspace
        defaultTab={
          ({ analysis: "Analysis", negotiation: "Negotiation", fulfillment: "Fulfillment", actuals: "Actuals", history: "History" } as Record<string, string>)[tab ?? ""] ??
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

            <span
              className="text-xs text-slate-500"
              title={
                campaignOverrides.length > 0
                  ? `Campaign overrides — ${campaignOverrides.join(" · ")}`
                  : undefined
              }
            >
              Campaign: {campaign?.name ?? deal.campaign ?? "—"}
              {campaignOverrides.length > 0 && (
                <span className="ml-1.5 text-brand-dark font-medium">
                  · {campaignOverrides.length} override{campaignOverrides.length > 1 ? "s" : ""}
                </span>
              )}
            </span>
            {deal.stage === "agreed" && (
              <CompleteDealButton
                dealId={deal.id}
                ready={workDone.ready}
                openWork={workDone.openWork}
              />
            )}
            {deal.stage === "declined" ? (
              <ReopenDealButton dealId={deal.id} />
            ) : (
              !closed && <DeclineDealButton dealId={deal.id} />
            )}
            <DeleteDealButton dealId={deal.id} creator={deal.creator} />
          </>
        }
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
              productCost={Number(econ.productCost ?? 0)}
              // Resolved at the tier rate the REAL volume earned, not the base rate.
              commission={{
                type: "per_order",
                value: earningsForecast({
                  expectedOrders: deal.actual_orders ?? 0,
                  commission: offer.commission,
                  aov: Number(econ.aov ?? 0),
                  discount: offer.discount,
                  tiers: styleTiers,
                }).perOrder,
              }}
              discount={offer.discount}
            />
          </section>
        ) : (
          /* The cockpit: who this is, what the numbers are, and whether we can afford
             it — the three things needed to decide an offer, side by side rather than
             stacked down the page with the money furthest from the identity. */
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 xl:gap-8 items-start">
            <div className="lg:col-span-4 flex items-start gap-4 min-w-0">
              <div className="w-16 h-16 rounded-lg bg-brand/10 text-brand-dark flex items-center justify-center font-bold text-2xl shrink-0">
                {deal.creator.charAt(0)}
              </div>
              <div className="flex flex-col gap-2 min-w-0">
                {deal.partner_id != null ? (
                  <Link
                    href={`/partners/${deal.partner_id}`}
                    className="font-headline text-2xl font-semibold text-slate-900 tracking-tight hover:text-brand"
                  >
                    {deal.creator}
                  </Link>
                ) : (
                  <h1 className="font-headline text-2xl font-semibold text-slate-900 tracking-tight">
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
                    {scope ? ` · ${scope}` : ""}
                  </span>
                  {dealCommission(deal).type !== "none" && (
                    <span
                      className="text-[11px] font-semibold bg-sky-50 text-sky-700 rounded-full px-2 py-0.5"
                      title="Paid on top of the fixed fee — the fee is priced net of this"
                    >
                      + {describeCommission(dealCommission(deal))}
                    </span>
                  )}
                  <span
                    className={`text-[11px] font-semibold rounded-full px-2 py-0.5 ${TONE_CLASS_BORDERED[DEAL_STAGE_TONE[deal.stage]]}`}
                  >
                    {STAGE_LABELS[deal.stage]}
                    {deal.round > 0 && !closed ? ` · Round ${deal.round}` : ""}
                  </span>
                  {deal.job_status && (
                    <JobChip
                      label={deal.job_status === "analyzing" ? "Analyzing…" : "Copilot drafting…"}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="lg:col-span-4 min-w-0">
              <CockpitNumbers deal={deal} />
              {ladder.scopeNote && (
                <p className="text-[11px] text-slate-500 mt-3">{ladder.scopeNote}</p>
              )}
            </div>

            <div className="lg:col-span-4 min-w-0">
              <AffordabilityPanel
                totalCost={dealCost.total}
                fee={deal.target}
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
        rail={
          <>
            {/* Reference data and private context, visible from every tab — a note or a
                promise like "ask again in three months" shouldn't hide behind whichever
                tab happened to be open. */}
            <AudienceDataEditor
              dealId={deal.id}
              avgViews={deal.avg_views}
              engagementRate={deal.engagement_rate}
              suspect={suspectAudienceData({ avgViews: deal.avg_views, followers })}
            />
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
              <AnalysisTab deal={deal} analyzedAt={getLastRunAt(deal.id, "analysis")} />
            ) },
          { name: "Negotiation", node: <NegotiationTab deal={deal} messages={messages} /> },
          ...(showFulfillment
            ? [{ name: "Fulfillment", node: (
                <div className="space-y-4 max-w-4xl">
                  {/* Fulfillment is a sequence, not a pile: finished phases fold to a
                      checkmark line so the current one is what the eye lands on. */}
                  <details open={contract?.status !== "confirmed"} className="group">
                    <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-semibold text-slate-700 py-1 select-none">
                      <span className="text-slate-400 group-open:rotate-90 transition-transform">▸</span>
                      1 · Paperwork
                      {contract?.status === "confirmed" && (
                        <span className="text-xs font-normal text-emerald-700">✓ contract confirmed</span>
                      )}
                    </summary>
                    <div className="space-y-4 mt-2">
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
                      <details open={!phaseDone} className="group">
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
                          />
                          <ShipmentsBlock dealId={deal.id} shipments={shipments} />
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
                      <PaymentItemsBlock dealId={deal.id} payments={paymentItems} />
                    </div>
                  </details>
                </div>
              ) }]
            : []),
          ...(closed || deal.agreed_price != null
            ? [{ name: "Actuals", node: (
                <ActualsPanel
                  deal={deal}
                  contentItems={contentItems}
                  expectedReach={expectedReach}
                  windows={getSetting<MeasurementWindows>("measurement_windows") ?? {}}
                />
              ) }]
            : []),
          { name: "History", node: <HistoryTab /> },
        ]}
      />
    </main>
  );
}
