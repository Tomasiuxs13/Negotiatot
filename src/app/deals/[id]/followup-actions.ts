"use server";

import { revalidatePath } from "next/cache";
import {
  addMessage,
  clearFollowUpState,
  getDeal,
  getFollowUpState,
  getMessages,
  snoozeFollowUp,
  updateDeal,
} from "@/lib/db";
import { dateAfterDays, getFollowUpCandidate } from "@/lib/followups";

function refresh(dealId: number) {
  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
}

/**
 * This records a message the manager has already sent in their own email tool. It does
 * not contact the creator; Gmail draft/send support can later call the same state update
 * only after Gmail confirms its own result.
 */
export async function markFollowUpSent(dealId: number, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Add a follow-up message first." };
  if (trimmed.length > 6000) return { error: "Keep the follow-up under 6,000 characters." };

  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found." };
  const candidate = getFollowUpCandidate(deal, getMessages(dealId), getFollowUpState(dealId));
  if (!candidate) {
    return { error: "This follow-up is no longer due. Refresh the page to see the latest thread." };
  }

  addMessage(dealId, "us", trimmed, {
    type: candidate.stage === "contacted" ? "outreach_follow_up" : "follow_up",
    anchor_message_id: candidate.anchorMessageId,
  });
  clearFollowUpState(dealId);
  updateDeal(dealId, {
    your_move: 0,
    // A contacted deal has no rounds yet — what matters there is which chase this was.
    status_label:
      candidate.stage === "contacted"
        ? `Follow-up ${candidate.followUpNumber} sent · awaiting reply`
        : `Round ${Math.max(deal.round, 1)} · follow-up sent · waiting on them`,
    status_tone: "neutral",
  });
  refresh(dealId);
  return {};
}

export async function snoozeFollowUpForTwoDays(dealId: number) {
  const deal = getDeal(dealId);
  if (!deal) return { error: "Deal not found." };
  const today = new Date().toISOString().slice(0, 10);
  const candidate = getFollowUpCandidate(deal, getMessages(dealId), getFollowUpState(dealId), { today });
  if (!candidate) {
    return { error: "This follow-up is no longer due. Refresh the page to see the latest thread." };
  }

  snoozeFollowUp({
    dealId,
    anchorMessageId: candidate.anchorMessageId,
    anchorAt: candidate.anchorAt,
    snoozedUntil: dateAfterDays(today, 2),
  });
  refresh(dealId);
  return {};
}
