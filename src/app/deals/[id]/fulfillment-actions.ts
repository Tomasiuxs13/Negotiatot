"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import sharp from "sharp";
import { getDeal, logUsage, updateDeal } from "@/lib/db";
import { hasApiKey, parseContract, MODEL, type ImageMediaType } from "@/lib/claude";
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
  getShipments,
  parseTerms,
  refreshPaymentStatuses,
  resolveDueDatesAfterDelivery,
  setContractError,
  setContractTerms,
  updateContentItem,
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
  revalidatePath("/payments");
  revalidatePath("/");
  revalidatePath("/pipeline");
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
    partnerId: deal.partner_id,
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
          deal.agreed_price != null ? `Agreed price: €${deal.agreed_price}` : "",
          deal.current_offer != null ? `Last offer: €${deal.current_offer}` : "",
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

  const dealId = contract.deal_id;
  const partnerId = contract.partner_id ?? deal.partner_id;

  // Replace anything generated from a previous confirmation of this contract.
  for (const item of getContentItems(dealId)) deleteContentItem(item.id);
  for (const shipment of getShipments(dealId)) deleteShipment(shipment.id);

  const contentIds: number[] = [];
  for (const deliverable of terms.deliverables ?? []) {
    const quantity = Math.max(1, Math.round(deliverable.quantity || 1));
    for (let i = 0; i < quantity; i++) {
      contentIds.push(
        createContentItem({
          dealId,
          partnerId,
          title: quantity > 1 ? `${deliverable.description} (${i + 1}/${quantity})` : deliverable.description,
          platform: deliverable.platform,
          dueDate: deliverable.dueDate,
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
      partnerId,
      description: payment.description,
      amount: payment.amount,
      trigger: payment.trigger,
      dueDate: payment.dueDate,
      // Verification-triggered money waits on all of this deal's content.
      linkedContentIds: payment.trigger === "on_verification" ? contentIds : [],
    });
    paymentCount += 1;
  }

  let shipmentCount = 0;
  if (terms.product) {
    createShipment({
      dealId,
      partnerId,
      product: terms.product.description,
      value: terms.product.value,
    });
    shipmentCount = 1;
  }

  confirmContract(contractId, terms, signedAt);
  updateDeal(dealId, {
    stage: "agreed",
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
) {
  updateContentItem(itemId, {
    status,
    ...(postedUrl !== undefined ? { postedUrl: postedUrl || null } : {}),
  });
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

export async function updateContentItemAction(
  itemId: number,
  dealId: number,
  fields: { dueDate?: string | null; postedUrl?: string | null; notes?: string | null }
) {
  updateContentItem(itemId, fields);
  refresh(dealId);
  return {};
}

export async function addContentItemAction(
  dealId: number,
  fields: { title: string; platform?: string | null; dueDate?: string | null }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!fields.title.trim()) return { error: "Give the content item a name." };
  createContentItem({ dealId, partnerId: deal.partner_id, ...fields, title: fields.title.trim() });
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

export async function deleteContentItemAction(itemId: number, dealId: number) {
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
  updatePaymentItem(itemId, { status });
  refresh(dealId);
  return {};
}

export async function addPaymentItemAction(
  dealId: number,
  fields: { description: string; amount: number; trigger: ParsedTerms["payments"][number]["trigger"] }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!fields.description.trim()) return { error: "Describe the payment." };
  if (!fields.amount || fields.amount <= 0) return { error: "Enter an amount." };
  createPaymentItem({
    dealId,
    partnerId: deal.partner_id,
    description: fields.description.trim(),
    amount: fields.amount,
    trigger: fields.trigger,
    linkedContentIds:
      fields.trigger === "on_verification" ? getContentItems(dealId).map((c) => c.id) : [],
  });
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

export async function deletePaymentItemAction(itemId: number, dealId: number) {
  deletePaymentItem(itemId);
  refresh(dealId);
  return {};
}

/* --------------------------------------------------------------- shipments */

export async function addShipmentAction(
  dealId: number,
  fields: { product: string; value?: number | null; address?: string | null }
) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found" };
  if (!fields.product.trim()) return { error: "Describe the product." };
  createShipment({ dealId, partnerId: deal.partner_id, ...fields, product: fields.product.trim() });
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
    status?: ShipmentStatus;
  }
) {
  updateShipment(shipmentId, fields);

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
