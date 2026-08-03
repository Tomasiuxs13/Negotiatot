"use server";

import { revalidatePath } from "next/cache";
import {
  getContentItems,
  refreshPaymentStatuses,
  updateContentItem,
  type ContentStatus,
} from "@/lib/fulfillment";

/**
 * The board edits the same rows the deal page does, so every surface that reads them has
 * to be revalidated — a status ticked here must not leave the deal page or the dashboard
 * showing the old one.
 */
function refresh(dealId: number) {
  revalidatePath("/content");
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath("/");
}

/**
 * Guards against a stale tab: a board left open across a deletion would otherwise update
 * nothing and report success, which is the failure mode that makes people stop trusting
 * a board and go back to the deal page.
 */
function exists(itemId: number, dealId: number): boolean {
  return getContentItems(dealId).some((c) => c.id === itemId);
}

export async function setContentStatusAction(
  itemId: number,
  dealId: number,
  status: ContentStatus
): Promise<{ error?: string }> {
  if (!exists(itemId, dealId)) {
    return { error: "That content item no longer exists — reload the board." };
  }
  updateContentItem(itemId, { status });
  // Verifying content is what releases money held against it.
  refreshPaymentStatuses(dealId);
  refresh(dealId);
  return {};
}

export async function setContentDueDateAction(
  itemId: number,
  dealId: number,
  dueDate: string | null
): Promise<{ error?: string }> {
  if (!exists(itemId, dealId)) {
    return { error: "That content item no longer exists — reload the board." };
  }
  updateContentItem(itemId, { dueDate: dueDate || null });
  refresh(dealId);
  return {};
}

export async function setContentPlatformAction(
  itemId: number,
  dealId: number,
  platform: string | null
): Promise<{ error?: string }> {
  if (!exists(itemId, dealId)) {
    return { error: "That content item no longer exists — reload the board." };
  }
  updateContentItem(itemId, { platform: platform || null });
  refresh(dealId);
  return {};
}
