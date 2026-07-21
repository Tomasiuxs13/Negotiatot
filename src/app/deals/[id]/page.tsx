import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaign, getDeal, getMessages, getUsageTotals } from "@/lib/db";
import { describeOverrides, parseOverrides } from "@/lib/campaigns";
import { PLATFORM_META, STAGES, dealPlatforms, dealScope } from "@/lib/types";
import PriceLadder from "@/components/deal/PriceLadder";
import DealTabs from "@/components/deal/DealTabs";
import DeleteDealButton from "@/components/deal/DeleteDealButton";
import ActualsPanel from "@/components/deal/ActualsPanel";
import JobPoller, { JobChip } from "@/components/deal/JobPoller";
import ContractBlock from "@/components/deal/ContractBlock";
import { ContentItemsBlock, PaymentItemsBlock, ShipmentsBlock } from "@/components/deal/WorkBlocks";
import {
  getContentItems,
  getContract,
  getPaymentItems,
  getShipments,
  parseTerms,
} from "@/lib/fulfillment";
import AnalysisTab from "@/components/deal/AnalysisTab";
import NegotiationTab from "@/components/deal/NegotiationTab";

export const dynamic = "force-dynamic";

const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

const STAGE_PILL: Record<string, string> = {
  analyzing: "bg-slate-100 text-slate-600 border border-slate-200",
  offer_sent: "bg-sky-50 text-sky-700 border border-sky-200",
  negotiating: "bg-amber-50 text-amber-700 border border-amber-200",
  agreed: "bg-emerald-50 text-emerald-700 border border-emerald-200",
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
  const showFulfillment =
    deal.stage === "agreed" ||
    contract != null ||
    contentItems.length > 0 ||
    paymentItems.length > 0 ||
    shipments.length > 0;

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
        <Link href="/" className="underline underline-offset-2 hover:text-slate-700">
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
          <span className="text-xs font-semibold bg-red-50 text-red-600 rounded-full px-2.5 py-1 flex items-center gap-1">
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
          <span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${STAGE_PILL[deal.stage]}`}>
            {STAGE_LABEL[deal.stage] ?? deal.stage}
            {deal.round > 0 ? ` · Round ${deal.round}` : ""}
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
          <DeleteDealButton dealId={deal.id} creator={deal.creator} />
        </div>

        <PriceLadder deal={deal} />
      </div>

      <DealTabs
        defaultTab={
          deal.stage === "agreed"
            ? "Fulfillment"
            : deal.stage === "negotiating" || deal.stage === "offer_sent"
              ? "Negotiation"
              : "Analysis"
        }
        analysis={<AnalysisTab deal={deal} />}
        negotiation={<NegotiationTab deal={deal} messages={messages} />}
        fulfillment={
          showFulfillment ? (
            <div className="space-y-4 max-w-4xl">
              <ContractBlock
                dealId={deal.id}
                contract={contract}
                terms={parseTerms(contract?.parsed_terms)}
              />
              <ContentItemsBlock dealId={deal.id} items={contentItems} />
              <ShipmentsBlock dealId={deal.id} shipments={shipments} />
              <PaymentItemsBlock dealId={deal.id} payments={paymentItems} />
            </div>
          ) : undefined
        }
        actuals={
          deal.stage === "agreed" || deal.agreed_price != null ? <ActualsPanel deal={deal} /> : undefined
        }
        history={<HistoryTab />}
      />
    </main>
  );
}
