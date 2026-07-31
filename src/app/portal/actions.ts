"use server";

import { revalidatePath } from "next/cache";
import { getPartnerByToken, getPartnerDeals } from "@/lib/db";
import { getContentItems, updateContentItem } from "@/lib/fulfillment";

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
