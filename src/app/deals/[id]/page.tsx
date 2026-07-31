import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign, getContractDraft, getDeal, getMessages, getNegotiationStyle, getPartnerChannels, getPlaybook, getRemindersFor, getSetting, getUsageTotals } from "@/lib/db";
import RemindersBlock from "@/components/RemindersBlock";
import type { MeasurementWindows } from "@/lib/measurement";
import { describeOverrides, parseOverrides } from "@/lib/campaigns";
import { DECLINE_REASON_LABEL, PLATFORM_META, STAGE_LABELS, dealPlatforms, dealScope } from "@/lib/types";
import PriceLadder from "@/components/deal/PriceLadder";
import DealProgress from "@/components/deal/DealProgress";
import DealTabs from "@/components/deal/DealTabs";
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
import { dealCommission, describeCommission, earningsForecast, expectedOrdersFrom, parseTiers, resolveOffer } from "@/lib/commission";
import { deliverableCount } from "@/lib/deliverables";
import { ladderNotes } from "@/lib/ladder-notes";
import AnalysisTab from "@/components/deal/AnalysisTab";
import NegotiationTab from "@/components/deal/NegotiationTab";
import DealNotes from "@/components/deal/DealNotes";
import ContractDraftBlock from "@/components/deal/ContractDraftBlock";

export const dynamic = "force-dynamic";


const STAGE_PILL: Record<string, string> = {
  analyzing: "bg-slate-100 text-slate-600 border border-slate-200",
  offer_sent: "bg-sky-50 text-sky-700 border border-sky-200",
  negotiating: "bg-amber-50 text-amber-700 border border-amber-200",
  agreed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  completed: "bg-slate-100 text-slate-600 border border-slate-200",
  declined: "bg-red-50 text-red-700 border border-red-200",
};

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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

  function HistoryTab() {
    const usage = getUsageTotals(deal.id);
    const estCost = (usage.inputTokens / 1_000_000) * 5 + (usage.outputTokens / 1_000_000) * 25;
    return (
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm p-5">
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
    <main className="flex-1 overflow-y-auto p-8">
      <JobPoller active={deal.job_status != null || contract?.status === "parsing"} />
      {deal.job_error && !deal.job_status && (
        <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 max-w-2xl">
          {deal.job_error}
        </div>
      )}
      <div className="text-xs text-slate-500 mb-3">
        <Link href="/pipeline" className="underline underline-offset-2 hover:text-slate-700">
          Pipeline
        </Link>{" "}
        / {deal.creator}
      </div>

      {/* Deal header */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-sm px-6 pt-5 pb-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 rounded-full bg-brand/10 text-brand-dark flex items-center justify-center font-bold text-sm">
            {deal.creator.charAt(0)}
          </div>
          {deal.partner_id != null ? (
            <Link
              href={`/partners/${deal.partner_id}`}
              className="font-headline text-lg font-semibold text-slate-900 hover:text-brand"
            >
              {deal.creator}
            </Link>
          ) : (
            <h1 className="font-headline text-lg font-semibold text-slate-900">{deal.creator}</h1>
          )}
          <span className="text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 flex items-center gap-1">
            {platforms.map((p) => (
              <span key={p} className="flex items-center gap-0.5">
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
                  {PLATFORM_META[p].icon}
                </span>
                {PLATFORM_META[p].label}
              </span>
            ))}
            {scope ? ` · ${scope}` : ""}
          </span>
          {dealCommission(deal).type !== "none" && (
            <span
              className="text-xs font-medium bg-sky-50 text-sky-700 rounded-full px-2.5 py-1"
              title="Paid on top of the fixed fee — the fee is priced net of this"
            >
              + {describeCommission(dealCommission(deal))}
            </span>
          )}
          <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STAGE_PILL[deal.stage]}`}>
            {STAGE_LABELS[deal.stage]}
            {deal.round > 0 && !closed ? ` · Round ${deal.round}` : ""}
          </span>
          {deal.job_status && (
            <JobChip
              label={deal.job_status === "analyzing" ? "Analyzing…" : "Copilot drafting…"}
            />
          )}
          <span
            className="text-xs text-slate-500 ml-auto"
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
        </div>

        {deal.stage === "declined" ? (
          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
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
            {deal.decline_note && (
              <p className="text-sm text-slate-600 mt-1">{deal.decline_note}</p>
            )}
            {deal.current_ask != null && deal.walkaway != null && (
              <p className="text-xs text-slate-400 mt-1.5 font-tabular">
                Their last position {money(deal.current_ask)} · your walk-away{" "}
                {money(deal.walkaway)}
              </p>
            )}
          </div>
        ) : closed ? (
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
        ) : (
          <PriceLadder deal={deal} scopeNote={ladder.scopeNote} costNote={ladder.costNote} />
        )}
      </div>

      <DealTabs
        defaultTab={
          deal.stage === "agreed"
            ? "Fulfillment"
            : deal.stage === "negotiating" || deal.stage === "offer_sent"
              ? "Negotiation"
              : "Analysis"
        }
        analysis={<AnalysisTab deal={deal} followers={followers} />}
        negotiation={<NegotiationTab deal={deal} messages={messages} />}
        fulfillment={
          showFulfillment ? (
            <div className="space-y-4 max-w-4xl">
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
              />
              <ShipmentsBlock dealId={deal.id} shipments={shipments} />
              <PaymentItemsBlock dealId={deal.id} payments={paymentItems} />
            </div>
          ) : undefined
        }
        actuals={
          closed || deal.agreed_price != null ? (
            <ActualsPanel
              deal={deal}
              contentItems={contentItems}
              expectedReach={expectedReach}
              windows={getSetting<MeasurementWindows>("measurement_windows") ?? {}}
            />
          ) : undefined
        }
        history={<HistoryTab />}
      />

      {/* Below the tabs so they're visible from every tab — a note or a promise like
          "ask again in three months" shouldn't hide behind the tab that was open. */}
      <div className="max-w-4xl mt-4 grid grid-cols-2 gap-4 items-start">
        <DealNotes dealId={deal.id} initialNotes={deal.notes ?? ""} />
        <RemindersBlock
          reminders={getRemindersFor({ dealId: deal.id })}
          dealId={deal.id}
          partnerId={deal.partner_id ?? undefined}
        />
      </div>
    </main>
  );
}
