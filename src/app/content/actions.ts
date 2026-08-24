"use server";

import { revalidatePath } from "next/cache";
import {
  getContentItems,
  refreshPaymentStatuses,
  updateContentItem,
  type ContentStatus,
} from "@/lib/fulfillment";
import { getDeal } from "@/lib/db";
import { canAdvanceContent, canManageFulfillment } from "@/lib/lifecycle";
import { dealPlatforms } from "@/lib/types";
import { resolvePlatform } from "@/lib/content-queue";

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
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found." };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  const item = getContentItems(dealId).find((content) => content.id === itemId)!;
  const transition = canAdvanceContent(item.status, status);
  if (!transition.ok) return { error: transition.reason };
  if (status === "posted") {
    return { error: "Open the deal and add the live URL before marking this posted." };
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
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found." };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
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
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found." };
  const access = canManageFulfillment(deal.stage);
  if (!access.ok) return { error: access.reason };
  const platforms = dealPlatforms(deal);
  if (platform && !platforms.some((candidate) => candidate === platform)) {
    return { error: "Choose a platform that belongs to this deal." };
  }
  const resolved = resolvePlatform({ platform: platform || null }, platforms);
  if (platforms.length > 1 && !resolved) {
    return { error: "A multi-platform deliverable must keep a platform." };
  }
  updateContentItem(itemId, { platform: resolved });
  refresh(dealId);
  return {};
}
