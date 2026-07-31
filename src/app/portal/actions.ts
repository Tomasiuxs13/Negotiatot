"use server";

import { revalidatePath } from "next/cache";
import { getPartnerByToken, getPartnerDeals, savePartnerLegalDetails } from "@/lib/db";
import { getContentItems, submitDraft, updateContentItem } from "@/lib/fulfillment";

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

  const item = getPartnerDeals(partner.id)
    .flatMap((d) => getContentItems(d.id))
    .find((c) => c.id === contentItemId);
  if (!item) return { error: "This content item isn't yours to update." };
  if (item.status === "verified") return { error: "This item is already verified — contact us to change it." };

  updateContentItem(contentItemId, {
    postedUrl: trimmed,
    // Only an approved draft going live moves the status; earlier stages keep theirs
    // so a URL pasted early can't skip the review loop.
    ...(item.status === "approved" || item.status === "posted" ? { status: "posted" as const } : {}),
  });
  revalidatePath(`/deals/${item.deal_id}`);
  return {};
}

/** The creator submits a draft link for review. Same token scoping as the live URL. */
export async function submitDraftAction(token: string, contentItemId: number, url: string) {
  const partner = getPartnerByToken(token);
  if (!partner) return { error: "This link is no longer valid." };
  const trimmed = url.trim();
  if (!/^https?:\/\/.{4,500}$/.test(trimmed)) return { error: "That doesn't look like a link." };
  const item = getPartnerDeals(partner.id)
    .flatMap((d) => getContentItems(d.id))
    .find((c) => c.id === contentItemId);
  if (!item) return { error: "This content item isn't yours to update." };
  if (!submitDraft(contentItemId, trimmed)) {
    return { error: "This item is past the draft stage — contact us to change it." };
  }
  revalidatePath(`/deals/${item.deal_id}`);
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
