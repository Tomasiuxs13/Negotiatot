"use server";

import { revalidatePath } from "next/cache";
import {
  createReminder,
  deleteReminder,
  getDeal,
  getPartner,
  getReminder,
  setReminderStatus,
} from "@/lib/db";

function refresh(r: { deal_id?: number | null; partner_id?: number | null }) {
  revalidatePath("/");
  if (r.deal_id != null) revalidatePath(`/deals/${r.deal_id}`);
  if (r.partner_id != null) revalidatePath(`/partners/${r.partner_id}`);
}

export async function addReminderAction(fields: {
  title: string;
  dueOn: string;
  partnerId?: number | null;
  dealId?: number | null;
}) {
  const title = fields.title.trim();
  if (!title) return { error: "Write what to do." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.dueOn)) return { error: "Pick a date." };
  if (fields.dealId == null && fields.partnerId == null) {
    return { error: "A reminder needs a deal or a partner to belong to." };
  }
  // The subject must exist — a reminder pointing at a deleted deal is unreachable
  // from every page and would sit in the attention panel forever.
  if (fields.dealId != null && !getDeal(fields.dealId)) return { error: "Deal not found." };
  if (fields.partnerId != null && !getPartner(fields.partnerId)) {
    return { error: "Partner not found." };
  }

  createReminder({ title, dueOn: fields.dueOn, partnerId: fields.partnerId, dealId: fields.dealId });
  refresh({ deal_id: fields.dealId, partner_id: fields.partnerId });
  return {};
}

export async function setReminderStatusAction(id: number, status: "open" | "done") {
  const reminder = getReminder(id);
  if (!reminder) return { error: "Reminder not found." };
  if (status !== "open" && status !== "done") return { error: "Not a valid status." };
  setReminderStatus(id, status);
  refresh(reminder);
  return {};
}

export async function deleteReminderAction(id: number) {
  const reminder = getReminder(id);
  if (!reminder) return { error: "Reminder not found — it may already be deleted." };
  deleteReminder(id);
  refresh(reminder);
  return {};
}
