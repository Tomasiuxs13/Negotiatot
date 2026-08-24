"use server";

import { revalidatePath } from "next/cache";
import { getPartnerByToken, getPartnerDeals, savePartnerLegalDetails } from "@/lib/db";
import {
  getContentItems,
  requestContentDueDate,
  submitDraft,
  updateContentItem,
} from "@/lib/fulfillment";
import { canManageFulfillment } from "@/lib/lifecycle";

/**
 * A creator's write lands on every screen that reads content status, not just the deal
 * page. A submitted draft is meant to appear on the Content board and start its review
 * clock on the dashboard the moment it arrives — revalidating only the deal page is how
 * a draft sits unnoticed until somebody happens to open that one deal.
 */
function refreshContentSurfaces(dealId: number) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/approvals");
  revalidatePath("/content");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

/**
 * The creator reports their own live URL. Token-scoped like every public write: the
 * item must belong to one of THIS partner's deals, the URL must be http(s), and the
 * status only advances from approved/posted — a creator can't verify their own work.
 */
export async function submitLiveUrlAction(token: string, contentItemId: number, url: string) {
  const partner = getPartnerByToken(token);
  if (!partner) return { error: "This link is no longer valid." };

  const trimmed = url.trim();
  if (!/^https?:\/\/.{4,500}$/.test(trimmed)) return { error: "That doesn't look like a link." };

  const partnerDeals = getPartnerDeals(partner.id);
  const owningDeal = partnerDeals.find((deal) =>
    getContentItems(deal.id).some((item) => item.id === contentItemId)
  );
  const item = owningDeal
    ? getContentItems(owningDeal.id).find((content) => content.id === contentItemId)
    : undefined;
  if (!item) return { error: "This content item isn't yours to update." };
  const access = canManageFulfillment(owningDeal!.stage);
  if (!access.ok) return { error: "This collaboration is not open for fulfillment changes." };
  if (item.status === "verified") return { error: "This item is already verified — contact us to change it." };

  updateContentItem(contentItemId, {
    postedUrl: trimmed,
    // Only an approved draft going live moves the status; earlier stages keep theirs
    // so a URL pasted early can't skip the review loop.
    ...(item.status === "approved" || item.status === "posted" ? { status: "posted" as const } : {}),
  });
  refreshContentSurfaces(item.deal_id);
  return {};
}

/** The creator submits a draft link for review. Same token scoping as the live URL. */
export async function submitDraftAction(token: string, contentItemId: number, url: string) {
  const partner = getPartnerByToken(token);
  if (!partner) return { error: "This link is no longer valid." };
  const trimmed = url.trim();
  if (!/^https?:\/\/.{4,500}$/.test(trimmed)) return { error: "That doesn't look like a link." };
  const partnerDeals = getPartnerDeals(partner.id);
  const owningDeal = partnerDeals.find((deal) =>
    getContentItems(deal.id).some((item) => item.id === contentItemId)
  );
  const item = owningDeal
    ? getContentItems(owningDeal.id).find((content) => content.id === contentItemId)
    : undefined;
  if (!item) return { error: "This content item isn't yours to update." };
  const access = canManageFulfillment(owningDeal!.stage);
  if (!access.ok) return { error: "This collaboration is not open for fulfillment changes." };
  if (!submitDraft(contentItemId, trimmed)) {
    return { error: "This item is past the draft stage — contact us to change it." };
  }
  refreshContentSurfaces(item.deal_id);
  return {};
}

/**
 * A creator can propose a different publication date, but cannot change the operational
 * calendar directly. The proposal becomes a manager-owned exception on the dashboard.
 */
export async function requestDueDateAction(
  token: string,
  contentItemId: number,
  fields: { dueDate: string; reason: string }
): Promise<{ error?: string }> {
  const partner = getPartnerByToken(token);
  if (!partner) return { error: "This link is no longer valid." };

  const dueDate = fields.dueDate.trim();
  const reason = fields.reason.trim();
  const parsed = new Date(`${dueDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== dueDate
  ) {
    return { error: "Choose a valid proposed date." };
  }
  if (dueDate < new Date().toISOString().slice(0, 10)) {
    return { error: "The proposed date cannot be in the past." };
  }
  if (!reason) return { error: "Please tell us why you need a different date." };
  if (reason.length > 1000) return { error: "Please keep the reason under 1,000 characters." };

  const partnerDeals = getPartnerDeals(partner.id);
  const owningDeal = partnerDeals.find((deal) =>
    getContentItems(deal.id).some((item) => item.id === contentItemId)
  );
  if (!owningDeal) return { error: "This content item isn't yours to update." };
  if (owningDeal.stage !== "agreed") {
    return { error: "This collaboration is not open for deadline changes." };
  }
  const item = getContentItems(owningDeal.id).find((content) => content.id === contentItemId);
  if (!item) return { error: "This content item isn't yours to update." };
  if (item.status === "posted" || item.status === "verified") {
    return { error: "This content is already live — contact us directly if its date is wrong." };
  }
  if (!requestContentDueDate(contentItemId, dueDate, reason)) {
    return { error: "That date request could not be saved. Refresh the page and try again." };
  }
  refreshContentSurfaces(owningDeal.id);
  revalidatePath(`/portal/${token}`);
  return {};
}

/** The creator's contract party details — name, company, tax id, address. */
export async function saveLegalDetailsAction(
  token: string,
  f: { legalName: string; companyName: string; taxId: string; legalAddress: string }
) {
  const partner = getPartnerByToken(token);
  if (!partner) return { error: "This link is no longer valid." };
  for (const v of Object.values(f)) if (v.length > 500) return { error: "A field is too long." };
  if (!f.legalName.trim()) return { error: "Your legal name is required." };
  savePartnerLegalDetails(partner.id, {
    legalName: f.legalName.trim(),
    companyName: f.companyName.trim(),
    taxId: f.taxId.trim(),
    legalAddress: f.legalAddress.trim(),
  });
  return {};
}
