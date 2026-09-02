"use server";
import { headers } from "next/headers";
import { getContractDraft, getPartner, markContractDraftSigned } from "@/lib/db";
import { fetchEnvelopeStatus, getEsignEnvelope, sendForSignature, updateEsignEnvelope } from "@/lib/docusign";
import { publicOriginFromHeaders } from "@/lib/public-origin";

/** The origin DocuSign redirects back to, and the one its API calls are configured for. */
async function publicOrigin(): Promise<string> {
  return publicOriginFromHeaders(await headers(), process.env.DOCUSIGN_REDIRECT_URI);
}

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import sharp from "sharp";
import { getCampaign, getDeal, getSetting, logUsage, updateDeal } from "@/lib/db";
import { hasApiKey, parseContract, MODEL, type ImageMediaType } from "@/lib/claude";
import { money } from "@/lib/format";
import { canTransition, isPaymentStatus } from "@/lib/payment-transitions";
import { contentHasOperationalActivity, shipmentTransitionError } from "@/lib/fulfillment-rules";
import { resolvePlatform } from "@/lib/content-queue";
import { dealPlatforms } from "@/lib/types";
import { canAdvanceContent, canManageFulfillment, isHttpUrl } from "@/lib/lifecycle";
import { parseCheck, parseRequirements, verificationBlocker } from "@/lib/brief-requirements";
import { saveFile, deleteFile } from "@/lib/files";
import {
  confirmContract,
  createContentItem,
  createContract,
  createPaymentItem,
  createShipment,
  deleteContentItem,
  deletePaymentItem,
  deleteShipment,
  getContentItems,
  getContract,
  getContractById,
  getPaymentItem,
  getPaymentItems,
  getShipments,
  getOnboardingForDeal,
  parseTerms,
  refreshPaymentStatuses,
  resolveDueDatesAfterDelivery,
  approveDraft,
  createOnboardingTask,
  ensureShipmentShareToken,
  requestChanges,
  resolveContentDueDateRequest,
  submitDraft,
  deleteOnboardingTask,
  seedOnboarding,
  setContentActuals,
  setContractError,
  updateOnboardingTask,
  DEFAULT_ONBOARDING,
  type OnboardingStatus,
  type OnboardingScope,
  type OnboardingTemplateStep,
  type TaskOwner,
  setContractTerms,
  updateContentItem,
  type ContentActuals,
  updatePaymentItem,
  updateShipment,
  type ContentStatus,
  type ParsedTerms,
  type PaymentStatus,
  type ShipmentStatus,
} from "@/lib/fulfillment";

const IMAGE_TYPES: ImageMediaType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function refresh(dealId: number) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/approvals");
  revalidatePath("/payments");
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath("/content");
}

/* ---------------------------------------------------------------- contract */

export async function uploadContractAction(
  dealId: number,
  formData: FormData
): Promise<{ error?: string }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };

  const file = formData.get("contract");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a contract file." };
  if (file.size > 25 * 1024 * 1024) return { error: "File is too large (max 25 MB)." };

  const isPdf = file.type.includes("pdf");
  const isImage = IMAGE_TYPES.includes(file.type as ImageMediaType);
  if (!isPdf && !isImage) return { error: "Upload a PDF or an image of the signed contract." };

  const buffer = Buffer.from(await file.arrayBuffer());
  const relativePath = saveFile(`contracts/deal-${dealId}`, file.name, buffer);

  const existing = getContract(dealId);
  if (existing) deleteFile(existing.file_path);

  const contractId = createContract({
    dealId,
    filename: file.name,
    filePath: relativePath,
    mime: file.type,
  });
  refresh(dealId);

  if (!hasApiKey()) {
    setContractError(contractId, "No ANTHROPIC_API_KEY configured — enter the terms manually.");
    refresh(dealId);
    return {};
  }

  after(async () => {
    try {
      let payload: { pdfBase64?: string; image?: { base64: string; mediaType: ImageMediaType } };
      if (isPdf) {
        payload = { pdfBase64: buffer.toString("base64") };
      } else {
        const resized = await sharp(buffer)
          .resize({ width: 2500, height: 2500, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 88 })
          .toBuffer();
        payload = { image: { base64: resized.toString("base64"), mediaType: "image/jpeg" } };
      }

      const result = await parseContract({
        ...payload,
        dealContext: [
          `Creator: ${deal.creator}`,
          `Deliverables discussed: ${deal.deliverables ?? deal.format ?? "unspecified"}`,
          deal.agreed_price != null ? `Agreed price: $${deal.agreed_price}` : "",
          deal.current_offer != null ? `Last offer: $${deal.current_offer}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
      logUsage(dealId, "analysis", MODEL, result.usage.inputTokens, result.usage.outputTokens);
      setContractTerms(contractId, result.terms as ParsedTerms);
    } catch (err) {
      console.error("parseContract failed:", err);
      setContractError(
        contractId,
        err instanceof Error ? err.message : "Could not read the contract."
      );
    }
    refresh(dealId);
  });

  return {};
}

/**
 * Turns confirmed contract terms into the actual work: content items, payment items,
 * and a shipment when a product is involved. This is the no-double-entry step.
 */
export async function confirmContractAction(
  contractId: number,
  terms: ParsedTerms,
  signedAt: string | null
): Promise<{ error?: string; created?: { content: number; payments: number; shipments: number } }> {
  const contract = getContractById(contractId);
  if (!contract) return { error: "Contract not found" };
  const deal = getDeal(contract.deal_id);
  if (!deal) return { error: "Deal not found" };
  if (deal.stage === "completed") {
    return { error: "Move this deal back to Agreed before replacing its contract or delivery plan." };
  }

  const dealId = contract.deal_id;

  // Re-confirming replaces everything generated before, so it must refuse when any of
  // it has become real. Without these guards, a second Confirm click duplicated the
  // entire payment schedule (the delete loop below covered content and shipments but
  // never payments — $6,000 owed became $12,000), and re-confirming a running deal
  // silently destroyed logged actuals.
  const existingPayments = getPaymentItems(dealId);
  const settled = existingPayments.filter((p) => p.status === "paid" || p.status === "approved");
  if (settled.length > 0) {
    const total = settled.reduce((sum, p) => sum + p.amount, 0);
    return {
      error:
        `${money(total)} on this deal is already approved or paid. Re-confirming would ` +
        `replace the payment schedule those rows belong to. Undo the approvals first, or ` +
        `adjust the payment items by hand instead of re-confirming.`,
    };
  }
  const progressed = getContentItems(dealId).filter(contentHasOperationalActivity);
  if (progressed.length > 0) {
    return {
      error:
        `${progressed.length} content item${progressed.length === 1 ? " has" : "s have"} production ` +
        `progress, notes, drafts, links, checks, or results. Re-confirming would delete that work. ` +
        `Edit the content and payment items by hand instead.`,
    };
  }

  const dealPlatformList = dealPlatforms(deal);
  const missingPlatform = (terms.deliverables ?? []).find(
    (deliverable) =>
      resolvePlatform({ platform: deliverable.platform }, dealPlatformList) == null
  );
  if (dealPlatformList.length > 1 && missingPlatform) {
    return {
      error:
        `Choose a platform for “${missingPlatform.description}” before confirming. ` +
        `A multi-platform item cannot be filtered or benchmarked safely without one.`,
    };
  }

  // Replace anything generated from a previous confirmation of this contract.
  for (const item of getContentItems(dealId)) deleteContentItem(item.id);
  for (const shipment of getShipments(dealId)) deleteShipment(shipment.id);
  for (const payment of existingPayments) deletePaymentItem(payment.id);

  const contentIds: number[] = [];
  for (const deliverable of terms.deliverables ?? []) {
    const quantity = Math.max(1, Math.round(deliverable.quantity || 1));
    for (let i = 0; i < quantity; i++) {
      contentIds.push(
        createContentItem({
          dealId,
          title: quantity > 1 ? `${deliverable.description} (${i + 1}/${quantity})` : deliverable.description,
          // A contract often names the deliverable without naming the channel. Inheriting
          // the deal's platform costs nothing when the deal has only one, and an item
          // with no platform is invisible to every platform filter downstream.
          platform: resolvePlatform({ platform: deliverable.platform }, dealPlatformList),
          dueDate: deliverable.dueDate,
          dueDateMode: deliverable.dueDateMode,
          dueRule: deliverable.dueRule,
          dueDaysAfterDelivery: deliverable.dueDaysAfterDelivery,
        })
      );
    }
  }

  let paymentCount = 0;
  for (const payment of terms.payments ?? []) {
    createPaymentItem({
      dealId,
      description: payment.description,
      amount: payment.amount,
      trigger: payment.trigger,
      dueDate: payment.dueDate,
      // Verification-triggered money waits on this deal's content — all of it, or the
      // milestone count the contract names ("50% after the first two videos").
      linkedContentIds: payment.trigger === "on_verification" ? contentIds : [],
      requiredVerified:
        payment.trigger === "on_verification" && payment.afterContentCount != null
          ? Math.max(1, Math.min(Math.round(payment.afterContentCount), contentIds.length))
          : null,
    });
    paymentCount += 1;
  }

  let shipmentCount = 0;
  if (terms.product) {
    createShipment({
      dealId,
      product: terms.product.description,
      value: terms.product.value,
    });
    shipmentCount = 1;
  }

  // Lay down the setup checklist too. A returning creator keeps whatever they already
  // completed, so nobody is asked to register twice.
  if (deal.partner_id != null) {
    seedOnboarding(
      dealId,
      deal.partner_id,
      getSetting<OnboardingTemplateStep[]>("onboarding_template") ?? DEFAULT_ONBOARDING
    );
  }

  confirmContract(contractId, terms, signedAt);
  updateDeal(dealId, {
    // Completed deals were rejected above; confirming an active contract records the win.
    stage: "agreed",
    // A confirmed contract IS the win; keep the first win date on re-confirmation.
    agreed_at: deal.agreed_at ?? new Date().toISOString().slice(0, 19).replace("T", " "),
    deal_type: terms.product ? (paymentCount > 0 ? "gifted_plus_paid" : "gifted") : "paid",
    agreed_price: terms.totalFee ?? deal.agreed_price ?? deal.current_offer,
    status_label: "Contract confirmed",
    status_tone: "good",
  });
  refreshPaymentStatuses(dealId);
  refresh(dealId);

  return {
    created: { content: contentIds.length, payments: paymentCount, shipments: shipmentCount },
  };
}

/* ----------------------------------------------------------- content items */

export async function setContentStatusAction(
  itemId: number,
  dealId: number,
  status: ContentStatus,
  postedUrl?: string
): Promise<{ error?: string }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  const item = getContentItems(dealId).find((content) => content.id === itemId);
  if (!item) return { error: "Content item not found — it may have been deleted." };

  const transition = canAdvanceContent(item.status, status);
  if (!transition.ok) return { error: transition.reason };

  const liveUrl = postedUrl?.trim() || item.posted_url || "";
  if (status === "posted" && !isHttpUrl(liveUrl)) {
    return { error: "Add a valid live http(s) URL before marking this content posted." };
  }
  if (status === "verified") {
    if (!isHttpUrl(liveUrl)) return { error: "A valid live URL is required before verification." };
    const campaign = deal.campaign_id != null ? getCampaign(deal.campaign_id) : null;
    const requirements = parseRequirements(campaign?.brief_requirements);
    const blocker = verificationBlocker(
      parseCheck(item.check_result),
      requirements.requirements,
      requirements.minIntegrationSeconds
    );
    if (blocker) return { error: blocker };
  }
  updateContentItem(itemId, {
    status,
    ...((status === "posted" || postedUrl !== undefined) ? { postedUrl: liveUrl || null } : {}),
  });
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

/** Records a draft supplied to the manager outside the creator portal. */
export async function submitDraftFromDealAction(
  contentItemId: number,
  dealId: number,
  url: string
): Promise<{ error?: string }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  const item = getContentItems(dealId).find((content) => content.id === contentItemId);
  if (!item) return { error: "Content item not found — it may have been deleted." };
  const trimmed = url.trim();
  if (!isHttpUrl(trimmed)) return { error: "Paste a valid http(s) draft link." };
  if (!submitDraft(contentItemId, trimmed)) {
    return { error: "Only planned or in-production content can be submitted for review." };
  }
  refresh(dealId);
  return {};
}

export async function updateContentItemAction(
  itemId: number,
  dealId: number,
  fields: {
    dueDate?: string | null;
    postedUrl?: string | null;
    notes?: string | null;
    platform?: string | null;
  }
): Promise<{ error?: string }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  // A blur-save from a stale tab can reference a deleted row; affecting 0 rows must
  // not read as success.
  const item = getContentItems(dealId).find((content) => content.id === itemId);
  if (!item) {
    return { error: "Content item not found — it may have been deleted." };
  }
  const nextFields = { ...fields };
  if (fields.platform !== undefined) {
    const platforms = dealPlatforms(deal);
    const platform = resolvePlatform({ platform: fields.platform }, platforms);
    if (fields.platform && !platforms.some((candidate) => candidate === fields.platform)) {
      return { error: "Choose a platform that belongs to this deal." };
    }
    if (platforms.length > 1 && !platform) {
      return { error: "A multi-platform deliverable must keep a platform." };
    }
    nextFields.platform = platform;
  }
  if (fields.postedUrl !== undefined) {
    const normalizedUrl = fields.postedUrl?.trim() || null;
    if (normalizedUrl && !isHttpUrl(normalizedUrl)) {
      return { error: "Use a valid http(s) URL for the published content." };
    }
    if ((item.status === "posted" || item.status === "verified") && !normalizedUrl) {
      return { error: "Posted or verified content must keep its live URL." };
    }
    nextFields.postedUrl = normalizedUrl;
  }
  updateContentItem(itemId, nextFields);
  refresh(dealId);
  return {};
}

/** Manager decision for a creator-proposed publication date. */
export async function resolveDueDateRequestAction(
  itemId: number,
  dealId: number,
  decision: "approve" | "reject"
): Promise<{ error?: string }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (decision !== "approve" && decision !== "reject") {
    return { error: "Choose whether to approve the request or keep the current date." };
  }
  const item = getContentItems(dealId).find((content) => content.id === itemId);
  if (!item) return { error: "Content item not found — it may have been deleted." };
  if (!item.requested_due_date) return { error: "This date request has already been resolved." };
  if (
    decision === "approve" &&
    item.requested_due_date < new Date().toISOString().slice(0, 10)
  ) {
    return { error: "The proposed date has passed. Ask the creator for a new date." };
  }
  if (!resolveContentDueDateRequest(itemId, decision === "approve")) {
    return { error: "This date request has already been resolved." };
  }
  refresh(dealId);
  return {};
}

export async function addContentItemAction(
  dealId: number,
  fields: { title: string; platform?: string | null; dueDate?: string | null }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (!fields.title.trim()) return { error: "Give the content item a name." };
  const platforms = dealPlatforms(deal);
  const platform = resolvePlatform({ platform: fields.platform ?? null }, platforms);
  if (fields.platform && !platforms.some((candidate) => candidate === fields.platform)) {
    return { error: "Choose a platform that belongs to this deal." };
  }
  if (platforms.length > 1 && !platform) {
    return { error: "Choose which platform this deliverable belongs to." };
  }
  createContentItem({
    dealId,
    ...fields,
    title: fields.title.trim(),
    platform,
  });
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

export async function deleteContentItemAction(itemId: number, dealId: number) {
  if (!getContentItems(dealId).some((item) => item.id === itemId)) {
    return { error: "Content item belongs to a different deal or was already deleted." };
  }
  deleteContentItem(itemId);
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

/* ----------------------------------------------------------- payment items */

export async function setPaymentStatusAction(
  itemId: number,
  dealId: number,
  status: PaymentStatus
) {
  // A server action is a network endpoint: the item may be gone, belong to another
  // deal, or the status may be any string a stale client sends. The type annotation
  // enforces none of that at runtime — these checks are the actual guarantee.
  const item = getPaymentItem(itemId);
  if (!item) return { error: "Payment not found — it may have been deleted." };
  if (item.deal_id !== dealId) return { error: "Payment belongs to a different deal." };
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (!isPaymentStatus(status)) return { error: "Not a valid payment status." };

  const allowed = canTransition(item.status, status);
  if (!allowed.ok) return { error: allowed.reason };

  updatePaymentItem(itemId, { status });
  refresh(dealId);
  return {};
}

export async function addPaymentItemAction(
  dealId: number,
  fields: {
    description: string;
    amount: number;
    trigger: ParsedTerms["payments"][number]["trigger"];
    /** Milestone gate: linked items that must be verified; null/undefined = all. */
    requiredVerified?: number | null;
  }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (!fields.description.trim()) return { error: "Describe the payment." };
  if (!fields.amount || fields.amount <= 0) return { error: "Enter an amount." };
  const linked =
    fields.trigger === "on_verification" ? getContentItems(dealId).map((c) => c.id) : [];
  let requiredVerified: number | null = null;
  if (fields.trigger === "on_verification" && fields.requiredVerified != null) {
    const n = Math.round(fields.requiredVerified);
    if (!Number.isFinite(n) || n < 1) return { error: "The milestone count must be at least 1." };
    if (linked.length > 0 && n > linked.length) {
      return { error: `Only ${linked.length} content item${linked.length === 1 ? " is" : "s are"} on this deal — the milestone can't need more.` };
    }
    requiredVerified = n;
  }
  createPaymentItem({
    dealId,
    description: fields.description.trim(),
    amount: fields.amount,
    trigger: fields.trigger,
    linkedContentIds: linked,
    requiredVerified,
  });
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

export async function deletePaymentItemAction(itemId: number, dealId: number) {
  const item = getPaymentItem(itemId);
  if (!item) return { error: "Payment not found — it may already be deleted." };
  if (item.deal_id !== dealId) return { error: "Payment belongs to a different deal." };
  // A paid row is settled history: deleting it silently removes real money from every
  // total and export with no audit trail. Correcting one is a manual, deliberate act.
  if (item.status === "paid") {
    return { error: "This payment is already paid — a settled payment can't be deleted." };
  }
  deletePaymentItem(itemId);
  refresh(dealId);
  return {};
}

/** Approve the submitted draft — freezes the version the approval refers to. */
export async function approveDraftAction(contentItemId: number, dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (!getContentItems(dealId).some((item) => item.id === contentItemId)) {
    return { error: "Content item belongs to a different deal or was deleted." };
  }
  if (!approveDraft(contentItemId)) {
    return { error: "No submitted draft to approve on this item." };
  }
  refresh(dealId);
  return {};
}

/** Request changes: stores the (edited) email and puts the item back in production. */
export async function requestChangesAction(
  contentItemId: number,
  dealId: number,
  emailText: string
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (!getContentItems(dealId).some((item) => item.id === contentItemId)) {
    return { error: "Content item belongs to a different deal or was deleted." };
  }
  if (!emailText.trim()) return { error: "Write (or keep) the change-request email first." };
  if (emailText.length > 10000) return { error: "That email is too long." };
  if (!requestChanges(contentItemId, emailText.trim())) {
    return { error: "Only a submitted draft can have changes requested." };
  }
  refresh(dealId);
  return {};
}

/* --------------------------------------------------------------- shipments */

/**
 * Mints (or returns) the shareable address-form link for a shipment. The creator
 * fills their own delivery details through it — addresses dictated over chat arrive
 * wrong, and the manager retypes them anyway.
 */
export async function shareShipmentFormAction(shipmentId: number, dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  const shipment = getShipments(dealId).find((s) => s.id === shipmentId);
  if (!shipment) return { error: "Shipment not found — it may have been deleted." };
  const token = ensureShipmentShareToken(shipmentId);
  if (!token) return { error: "Could not create a link for this shipment." };
  refresh(dealId);
  return { url: `/ship/${token}` };
}

export async function addShipmentAction(
  dealId: number,
  fields: { product: string; value?: number | null; address?: string | null }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (!fields.product.trim()) return { error: "Describe the product." };
  createShipment({ dealId, ...fields, product: fields.product.trim() });
  refresh(dealId);
  return {};
}

export async function updateShipmentAction(
  shipmentId: number,
  dealId: number,
  fields: {
    product?: string;
    value?: number | null;
    address?: string | null;
    carrier?: string | null;
    tracking?: string | null;
    trackingException?: string | null;
    status?: ShipmentStatus;
  }
): Promise<{ error?: string; resolvedDueDates?: number }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  const shipment = getShipments(dealId).find((x) => x.id === shipmentId);
  if (!shipment) {
    return { error: "Shipment not found — it may have been deleted." };
  }
  if (
    fields.status !== undefined &&
    !(["to_prepare", "shipped", "delivered"] as string[]).includes(fields.status)
  ) {
    return { error: "Not a valid shipment status." };
  }
  const normalized = {
    ...fields,
    ...(fields.product !== undefined ? { product: fields.product.trim() } : {}),
    ...(fields.address !== undefined ? { address: fields.address?.trim() || null } : {}),
    ...(fields.carrier !== undefined ? { carrier: fields.carrier?.trim() || null } : {}),
    ...(fields.tracking !== undefined ? { tracking: fields.tracking?.trim() || null } : {}),
    ...(fields.trackingException !== undefined
      ? { trackingException: fields.trackingException?.trim() || null }
      : {}),
  };
  if (fields.status !== undefined) {
    const transitionError = shipmentTransitionError(shipment, fields.status, normalized);
    if (transitionError) return { error: transitionError };
  }
  updateShipment(shipmentId, normalized);

  // Delivery starts the content clock and can unlock delivery-triggered money.
  if (fields.status === "delivered") {
    const resolved = resolveDueDatesAfterDelivery(dealId, new Date().toISOString().slice(0, 10));
    refreshPaymentStatuses(dealId);
    refresh(dealId);
    return { resolvedDueDates: resolved };
  }
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

export async function deleteShipmentAction(shipmentId: number, dealId: number) {
  if (!getShipments(dealId).some((shipment) => shipment.id === shipmentId)) {
    return { error: "Shipment belongs to a different deal or was already deleted." };
  }
  deleteShipment(shipmentId);
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

export async function saveTermsAction(contractId: number, terms: ParsedTerms) {
  const contract = getContractById(contractId);
  if (!contract) return { error: "Contract not found" };
  setContractTerms(contractId, terms);
  refresh(contract.deal_id);
  return {};
}

export async function getParsedTerms(contractId: number) {
  const contract = getContractById(contractId);
  return contract ? parseTerms(contract.parsed_terms) : null;
}

export async function saveContentActualsAction(
  itemId: number,
  dealId: number,
  actuals: ContentActuals
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (deal.stage !== "agreed" && deal.stage !== "completed") {
    return { error: "Mark the deal Agreed before logging campaign results." };
  }
  const item = getContentItems(dealId).find((content) => content.id === itemId);
  if (!item) return { error: "Content item belongs to a different deal or was deleted." };
  if (item.status !== "posted" && item.status !== "verified") {
    return { error: "Results can only be logged after content is posted." };
  }
  setContentActuals(itemId, actuals);
  refresh(dealId);
  revalidatePath("/benchmarks");
  return {};
}

/* --------------------------------------------------------------- onboarding */

export async function setOnboardingStatusAction(
  taskId: number,
  dealId: number,
  status: OnboardingStatus
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (!getOnboardingForDeal(dealId, deal.partner_id).some((task) => task.id === taskId)) {
    return { error: "Onboarding task belongs to a different collaboration." };
  }
  updateOnboardingTask(taskId, { status });
  refresh(dealId);
  revalidatePath("/partners", "layout");
  return {};
}

export async function setOnboardingValueAction(
  taskId: number,
  dealId: number,
  value: string
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (!getOnboardingForDeal(dealId, deal.partner_id).some((task) => task.id === taskId)) {
    return { error: "Onboarding task belongs to a different collaboration." };
  }
  const trimmed = value.trim();
  // Capturing the link or code is the task — record it and tick it in one move.
  updateOnboardingTask(taskId, {
    value: trimmed || null,
    ...(trimmed ? { status: "done" as const } : {}),
  });
  refresh(dealId);
  revalidatePath("/partners", "layout");
  return {};
}

export async function addOnboardingTaskAction(
  dealId: number,
  fields: { label: string; owner: TaskOwner; scope: OnboardingScope }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (deal.partner_id == null) return { error: "This deal has no partner yet" };
  if (!fields.label.trim()) return { error: "Give the step a name" };

  createOnboardingTask({
    partnerId: deal.partner_id,
    dealId: fields.scope === "partner" ? null : dealId,
    kind: "custom",
    label: fields.label.trim(),
    owner: fields.owner,
  });
  refresh(dealId);
  return {};
}

export async function deleteOnboardingTaskAction(taskId: number, dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!getOnboardingForDeal(dealId, deal.partner_id).some((task) => task.id === taskId)) {
    return { error: "Onboarding task belongs to a different collaboration." };
  }
  deleteOnboardingTask(taskId);
  refresh(dealId);
  return {};
}

/** Applies the configured checklist to a deal that doesn't have one yet. */
export async function startOnboardingAction(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  if (deal.partner_id == null) return { error: "This deal has no partner yet" };

  const template =
    getSetting<OnboardingTemplateStep[]>("onboarding_template") ?? DEFAULT_ONBOARDING;
  const result = seedOnboarding(dealId, deal.partner_id, template);
  refresh(dealId);
  return result;
}

// ---------------------------------------------------------------------------------------
// E-signature
// ---------------------------------------------------------------------------------------

/**
 * Sends the current contract draft to the creator for signature.
 *
 * The draft is sent as-is, including any edits made in the platform — the text on screen
 * is the text that gets signed. Sending does not mark the draft signed: that only happens
 * when DocuSign reports the envelope complete and the signed PDF is filed, so a draft can
 * never show as signed on the strength of an email having gone out.
 */
export async function sendContractForSignatureAction(
  dealId: number
): Promise<{ error?: string; status?: string }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };

  const draft = getContractDraft(dealId);
  if (!draft?.body.trim()) return { error: "Generate the contract draft first." };
  if (draft.status === "signed") return { error: "This contract is already marked signed." };

  const partner = deal.partner_id != null ? getPartner(deal.partner_id) : null;
  const email = partner?.email?.trim();
  if (!email) {
    return { error: "The creator has no email address on their profile — add one before sending." };
  }

  const existing = getEsignEnvelope(dealId);
  if (existing && existing.status !== "declined" && existing.status !== "voided" && existing.status !== "completed") {
    return { error: "This contract is already out for signature. Check its status instead." };
  }

  try {
    const origin = await publicOrigin();
    const { envelope } = await sendForSignature({
      origin,
      dealId,
      body: draft.body,
      subject: `Collaboration agreement — ${deal.creator}`,
      recipientName: partner?.legal_name?.trim() || partner?.name || deal.creator,
      recipientEmail: email,
    });
    refresh(dealId);
    return { status: envelope.status };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "DocuSign could not send the contract." };
  }
}

/**
 * Asks DocuSign where the envelope stands, and files the signed PDF when it is done.
 *
 * Filing goes through the same `contracts` record an uploaded scan would create, so the
 * parse, the rights check and confirmation are the paths that already exist. The draft is
 * marked signed at the same moment, which is what locks it from further editing.
 */
export async function refreshSignatureStatusAction(
  dealId: number
): Promise<{ error?: string; status?: string; filed?: boolean }> {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  const envelope = getEsignEnvelope(dealId);
  if (!envelope) return { error: "This contract has not been sent for signature." };
  if (envelope.status === "completed" && envelope.filed_contract_id != null) {
    return { status: "completed", filed: true };
  }

  try {
    const origin = await publicOrigin();
    const result = await fetchEnvelopeStatus(origin, envelope.envelope_id);
    if (!result.signedPdf) {
      updateEsignEnvelope(envelope.id, { status: result.status, lastError: null });
      refresh(dealId);
      return { status: result.status, filed: false };
    }

    const relativePath = saveFile(
      `contracts/deal-${dealId}`,
      `docusign-${envelope.envelope_id}.pdf`,
      result.signedPdf
    );
    const previous = getContract(dealId);
    if (previous) deleteFile(previous.file_path);
    const contractId = createContract({
      dealId,
      filename: `Signed agreement (DocuSign).pdf`,
      filePath: relativePath,
      mime: "application/pdf",
    });
    updateEsignEnvelope(envelope.id, {
      status: result.status,
      completedAt: result.completedAt,
      filedContractId: contractId,
      lastError: null,
    });
    // The signed original is now the record; the draft stops being editable.
    markContractDraftSigned(dealId);
    refresh(dealId);

    if (hasApiKey()) {
      after(async () => {
        try {
          const { terms, usage } = await parseContract({
            pdfBase64: result.signedPdf!.toString("base64"),
            dealContext: `Deal ${dealId} with ${deal.creator}.`,
          });
          setContractTerms(contractId, terms as ParsedTerms);
          logUsage(dealId, "brief", MODEL, usage.inputTokens, usage.outputTokens);
        } catch (error) {
          setContractError(
            contractId,
            error instanceof Error ? error.message : "The signed contract could not be read."
          );
        }
        refresh(dealId);
      });
    } else {
      setContractError(contractId, "No ANTHROPIC_API_KEY configured — enter the terms manually.");
    }
    return { status: result.status, filed: true };
  } catch (error) {
    updateEsignEnvelope(envelope.id, {
      lastError: error instanceof Error ? error.message : "DocuSign could not be reached.",
    });
    refresh(dealId);
    return { error: error instanceof Error ? error.message : "DocuSign could not be reached." };
  }
}
