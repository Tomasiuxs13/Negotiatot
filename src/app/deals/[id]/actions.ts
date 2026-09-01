"use server";

import { revalidatePath } from "next/cache";
import { hasRights, parseRights, type DealRights } from "@/lib/rights";
import { fileReportAgainstPartner, readReportFile } from "@/lib/report-upload";
import { dependentCopilotIds, repairThread } from "@/lib/thread-repair";
import { after } from "next/server";
import { addMessage, clearFollowUpState, deleteMessage, getContractDraft, getDeal, getMessage, getMessages, getPartner, markContractDraftSigned, saveContractDraft, setJob, updateDeal, upsertPartnerChannel, getUnitEconomics } from "@/lib/db";
import { getContentItems, getPaymentItems } from "@/lib/fulfillment";
import { generateContractText } from "@/lib/contract-template";
import { getSetting } from "@/lib/db";
import { hasApiKey } from "@/lib/claude";
import { performAnalysis, performRecommendation, platformsOf } from "@/lib/engine";
import { recommendationGuardError } from "@/lib/recommendation-guard";
import { stageAfterOffer, stageAfterTheirReply } from "@/lib/stage-advance";
import { normalizeTake, parseTakeAmount, takeGuardWarning } from "@/lib/manager-take";
import { dealPlatforms } from "@/lib/types";

const NO_KEY_ERROR =
  "No ANTHROPIC_API_KEY configured — add it to counterpart/.env.local and restart the dev server.";

export async function markDraftAsSent(dealId: number, text: string, proposedOffer: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (deal.stage === "agreed" || deal.stage === "completed" || deal.stage === "declined") {
    return { error: "Reopen this deal before sending another offer." };
  }
  const guardError = recommendationGuardError({
    proposedOffer,
    walkaway: deal.walkaway,
    breakeven: deal.breakeven,
  });
  if (guardError) return { error: guardError };
  addMessage(dealId, "us", text, { offer: proposedOffer });
  clearFollowUpState(dealId);
  updateDeal(dealId, {
    current_offer: proposedOffer,
    your_move: 0,
    stage: stageAfterOffer(deal.stage),
    status_label: `Round ${Math.max(deal.round, 1)} · waiting on them`,
    status_tone: "neutral",
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

export async function addTheirReply(dealId: number, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Empty message" };
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (deal.stage === "agreed" || deal.stage === "completed" || deal.stage === "declined") {
    return { error: "Reopen this deal before adding another negotiation reply." };
  }

  addMessage(dealId, "them", trimmed);
  clearFollowUpState(dealId);
  const round = deal.round + 1;
  updateDeal(dealId, {
    round,
    your_move: 1,
    stage: stageAfterTheirReply(deal.stage, deal.current_offer != null),
    status_label: `Round ${round} · your move`,
    status_tone: "warn",
  });

  if (!hasApiKey()) {
    revalidatePath(`/deals/${dealId}`);
    revalidatePath("/");
  revalidatePath("/pipeline");
    return { error: `Message saved, but recommendations are unavailable: ${NO_KEY_ERROR}` };
  }

  // Their rate arriving on a deal that was never priced is the analysis trigger, not a
  // negotiation move: there is nothing to counter with until the deal has been priced,
  // and the analysis is what reads their number out of this very message.
  const needsPricing = deal.analysis == null;
  if (!setJob(dealId, needsPricing ? "analyzing" : "recommending")) {
    return { error: "Message saved — but the Copilot is already working on this deal. Regenerate when it finishes." };
  }
  // "Drafting" is only claimed once the job actually is — a refused job that left this
  // label up promised a draft that was never coming.
  updateDeal(dealId, {
    status_label: needsPricing ? "Their ask is in · analyzing…" : `Round ${round} · Copilot drafting…`,
  });
  after(() => (needsPricing ? performAnalysis(dealId) : performRecommendation(dealId)));
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

/**
 * Runs the Copilot's next move. Used both for the opening offer and to redo an existing
 * recommendation against changed rules — the work is identical either way.
 */
export async function runRecommendation(
  dealId: number,
  rawTake?: string | null,
  /** Set once the manager has seen the warning and asked for it anyway. */
  approveOverride = false
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (deal.stage === "agreed" || deal.stage === "completed" || deal.stage === "declined") {
    return { error: "Reopen this deal before generating another negotiation move." };
  }
  if (!hasApiKey()) return { error: NO_KEY_ERROR };

  // The manager's own instruction for this draft, checked against the guardrails before
  // the call: a take above the ceiling would come back as a failed job rather than an
  // explanation, and the fix is usually the scope, not the number.
  const take = normalizeTake(rawTake);
  let approvedOverride: number | null = null;
  if (take) {
    const warning = takeGuardWarning({
      take,
      walkaway: deal.walkaway,
      breakeven: deal.breakeven,
      deliverables: deal.deliverables,
      platforms: dealPlatforms(deal),
      minPaidFee: Number(getUnitEconomics().minPaidFee ?? 0) || null,
    });
    // A warning, not a veto: it is shown once, and the manager decides. Blocking here
    // would be the app overruling the person who owns the budget.
    if (warning && !approveOverride) return { warning };
    if (warning && approveOverride) {
      approvedOverride = parseTakeAmount(take)?.total ?? null;
    }
  }

  if (!setJob(dealId, "recommending")) {
    return { error: "The Copilot is already working on this deal — wait for it to finish." };
  }
  after(() => performRecommendation(dealId, take, approvedOverride));
  revalidatePath(`/deals/${dealId}`);
  return {};
}

export async function runAnalysis(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!hasApiKey()) return { error: NO_KEY_ERROR };

  if (!setJob(dealId, "analyzing")) {
    return { error: "The Copilot is already working on this deal — wait for it to finish." };
  }
  updateDeal(dealId, { status_label: "Analyzing…", status_tone: "neutral" });
  after(() => performAnalysis(dealId));
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

/**
 * Correct the audience figures a deal is priced from, and re-price on them.
 *
 * These could only be set at intake, so a wrong number was permanent: a 445k-subscriber
 * channel captured at 4,900 average views stayed there through every re-run, and the
 * analysis — which flagged the figure as impossible — had no choice but to price on it
 * and produced a $100-a-video offer. Views are the single input every number derives
 * from, so they have to be correctable after intake.
 */
export async function saveAudienceData(
  dealId: number,
  avgViews: number | null,
  engagementRate: number | null
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (avgViews != null && (!Number.isFinite(avgViews) || avgViews < 0)) {
    return { error: "Average views must be a positive number." };
  }
  if (engagementRate != null && (!Number.isFinite(engagementRate) || engagementRate < 0)) {
    return { error: "Engagement rate must be a positive number." };
  }

  // Lock the figures: a hand-set number is a correction, and a re-run analysis must
  // not overwrite it with a fresh estimate of the same wrong thing.
  updateDeal(dealId, { avg_views: avgViews, engagement_rate: engagementRate, audience_locked: 1 });

  // Write the correction back to the partner's channel record too. playbookContext feeds
  // the prompt's channelReach from partner_channels, not from the deal — so a correction
  // that stopped at the deal row left the engine still pricing on the stale intake figure,
  // with the deal sheet and the analysis disagreeing by 16x and no way to reconcile them.
  // Only the platforms on THIS deal are touched; a creator's other channels keep their own reach.
  if (deal.partner_id != null && (avgViews != null || engagementRate != null)) {
    for (const platform of platformsOf(deal)) {
      upsertPartnerChannel({
        partnerId: deal.partner_id,
        platform,
        avgViews: avgViews ?? undefined,
        engagementRate: engagementRate ?? undefined,
      });
    }
    revalidatePath("/partners");
  }

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

export async function saveActuals(
  dealId: number,
  actuals: {
    views?: number | null;
    engagements?: number | null;
    clicks?: number | null;
    orders?: number | null;
    revenue?: number | null;
  }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  updateDeal(dealId, {
    actual_views: actuals.views ?? null,
    actual_engagements: actuals.engagements ?? null,
    actual_clicks: actuals.clicks ?? null,
    actual_orders: actuals.orders ?? null,
    actual_revenue: actuals.revenue ?? null,
    actuals_logged_at: new Date().toISOString(),
    // Logging results implies the deal closed — but never drag a wrapped-up deal
    // back out of Completed.
    stage:
      deal.stage === "completed" || deal.stage === "agreed" || deal.agreed_price == null
        ? deal.stage
        : "agreed",
  });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/benchmarks");
  revalidatePath("/");
  revalidatePath("/pipeline");
  // Actual views are what turn a partner's committed spend into a real CPM, so the
  // partners table is reading the number this action just changed.
  revalidatePath("/partners");
  return {};
}

/**
 * Remove a message pasted into the wrong deal — and everything it caused.
 *
 * A wrong paste is never just a row: it bumps the round, hands you the move, and the
 * recommendation it triggers stamps the wrong creator's ask on this deal. So deletion
 * takes the dependent copilot messages with it (they were computed from a thread
 * containing the mistake) and rewinds round, move, asks, stage and label to what the
 * remaining thread actually supports — all decided in thread-repair.ts, where it is
 * tested.
 */
export async function deleteMessageAction(dealId: number, messageId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const message = getMessage(messageId);
  if (!message || message.deal_id !== dealId) {
    return { error: "That message is not on this deal." };
  }

  const all = getMessages(dealId);
  const casualties = message.sender === "copilot" ? [] : dependentCopilotIds(all, messageId);
  for (const id of [messageId, ...casualties]) deleteMessage(id);

  const remaining = all.filter((m) => m.id !== messageId && !casualties.includes(m.id));
  const repair = repairThread(remaining, deal);
  updateDeal(dealId, {
    round: repair.round,
    your_move: repair.your_move,
    ...("first_ask" in repair ? { first_ask: null, current_ask: null } : {}),
    ...(repair.stage ? { stage: repair.stage } : {}),
    ...(repair.status_label ? { status_label: repair.status_label, status_tone: "neutral" } : {}),
  });

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {
    removedRecommendations: casualties.length,
  };
}

/**
 * Attach an analytics report after intake and re-price on it.
 *
 * The intake form was the only door a Modash/HypeAuditor document could enter through,
 * so a deal created before the report arrived could never use it — the workaround was
 * deleting the deal and starting over, losing the thread. This is the same machinery
 * the intake feeds (extraction pass, provenance, raw-document fallback), reached from
 * the deal page. The audience lock keeps its meaning: a hand-corrected figure still
 * outranks whatever the report says.
 */
export async function attachReportAndAnalyze(
  dealId: number,
  formData: FormData,
  /** Set once the manager has seen the shape warning and wants it analysed regardless. */
  acceptTallPage = false
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!hasApiKey()) return { error: NO_KEY_ERROR };

  const report = await readReportFile(formData.get("report"));
  if (report.kind === "error") return { error: report.error };
  if (report.kind === "none") return { error: "Choose a PDF report or a screenshot first." };
  // Said before the call, not after: a page this shape reaches the model unreadable, and
  // the failure it produces costs money and explains nothing.
  if (report.kind === "pdf" && report.tallPage && !acceptTallPage) {
    return { warning: report.tallPage };
  }

  if (!setJob(dealId, "analyzing")) {
    return { error: "The Copilot is already working on this deal — wait for it to finish." };
  }
  // Keep the document, not just what the model read out of it.
  fileReportAgainstPartner(report, deal.partner_id, dealId);
  updateDeal(dealId, { status_label: "Analyzing report…", status_tone: "neutral" });
  after(() =>
    performAnalysis(dealId, {
      reportPdfBase64: report.kind === "pdf" ? report.pdfBase64 : undefined,
      reportImage: report.kind === "image" ? report.image : undefined,
    })
  );
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

export async function saveRightsAction(dealId: number, rights: DealRights) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  // Round-trip through parseRights: whatever the client sent, only the normalised
  // shape is stored — a disabled right keeps no duration, junk keeps nothing.
  const normalised = parseRights(JSON.stringify(rights));
  updateDeal(dealId, { rights: hasRights(normalised) ? JSON.stringify(normalised) : null });
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/pipeline");
  return {};
}

export async function saveDealNotesAction(dealId: number, notes: string) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (notes.length > 5000) return { error: "Notes are too long — keep them under 5,000 characters." };
  updateDeal(dealId, { notes: notes.trim() || null });
  revalidatePath(`/deals/${dealId}`);
  return {};
}

export async function generateContractDraftAction(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const existing = getContractDraft(dealId);
  if (existing?.status === "signed") return { error: "The contract is marked signed — it can't be regenerated." };
  const body = generateContractText({
    deal,
    partner: deal.partner_id != null ? (getPartner(deal.partner_id) ?? null) : null,
    items: getContentItems(dealId),
    payments: getPaymentItems(dealId),
    brand: getSetting<Record<string, string>>("brand_profile") ?? {},
  });
  saveContractDraft(dealId, body);
  revalidatePath(`/deals/${dealId}`);
  return { body };
}

export async function saveContractDraftAction(dealId: number, body: string) {
  if (!getDeal(dealId)) return { error: "Deal not found" };
  if (!body.trim()) return { error: "The contract can't be empty." };
  if (body.length > 50000) return { error: "That's too long." };
  const existing = getContractDraft(dealId);
  if (existing?.status === "signed") return { error: "Signed — no longer editable." };
  saveContractDraft(dealId, body);
  revalidatePath(`/deals/${dealId}`);
  return {};
}

export async function markContractSignedAction(dealId: number) {
  if (!getDeal(dealId)) return { error: "Deal not found" };
  if (!markContractDraftSigned(dealId)) return { error: "No draft contract to mark signed." };
  revalidatePath(`/deals/${dealId}`);
  return {};
}

export async function deleteDeal(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const { default: db } = await import("@/lib/db");
  db.prepare("DELETE FROM messages WHERE deal_id = ?").run(dealId);
  db.prepare("DELETE FROM deals WHERE id = ?").run(dealId);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return {};
}

/**
 * Rewrites the copilot's draft in another tone, on request.
 *
 * Not persisted: the rewrite lives in the card for the session. The stored recommendation
 * is the record of what the Copilot advised, and quietly rewriting it afterwards would
 * make the history disagree with what was actually reasoned.
 */
export async function rewriteDraftAction(
  dealId: number,
  draft: string,
  tone: string
): Promise<{ draft?: string; error?: string }> {
  const { rewriteDraft, MODEL, hasApiKey } = await import("@/lib/claude");
  const { getDeal, logUsage } = await import("@/lib/db");
  if (!hasApiKey()) return { error: "No Anthropic API key configured." };
  if (!draft.trim()) return { error: "Nothing to rewrite yet." };
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found." };
  try {
    const r = await rewriteDraft({ draft, tone, creator: deal.creator });
    logUsage(dealId, "rewrite", MODEL, r.usage.inputTokens, r.usage.outputTokens);
    return { draft: r.draft };
  } catch (err) {
    console.error("rewriteDraftAction failed:", err);
    return { error: err instanceof Error ? err.message : "Could not rewrite the draft." };
  }
}
