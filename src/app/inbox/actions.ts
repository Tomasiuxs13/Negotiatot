"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { addTheirReply } from "@/app/deals/[id]/actions";
import {
  addPartnerContact,
  findPartnerByEmail,
  getDeal,
  getInboxEmail,
  getMessages,
  setInboundEmailMatch,
  setInboundEmailStatus,
} from "@/lib/db";
import { syncGmailAutomation, syncGmailInbox } from "@/lib/gmail";
import { normalizeEmail } from "@/lib/creator-identity";
import { TERMINAL_STAGES } from "@/lib/types";

async function requestOrigin(): Promise<string> {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin) return origin;
  const host = requestHeaders.get("host") ?? "localhost:3000";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

export async function syncGmailInboxAction(): Promise<{
  added?: number;
  matched?: number;
  unmatched?: number;
  filtered?: number;
  sentLogged?: number;
  repliesLogged?: number;
  dealsContacted?: number;
  automationStarted?: boolean;
  error?: string;
}> {
  try {
    const origin = await requestOrigin();
    const automatic = await syncGmailAutomation(origin);
    const result = await syncGmailInbox(origin);
    revalidatePath("/inbox");
    revalidatePath("/settings");
    revalidatePath("/pipeline");
    revalidatePath("/");
    return {
      ...result,
      sentLogged: automatic.sentLogged,
      repliesLogged: automatic.repliesLogged,
      dealsContacted: automatic.dealsContacted,
      automationStarted: automatic.started,
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Inbox sync failed." };
  }
}

export async function addInboxEmailToDealAction(id: number): Promise<{ notice?: string; error?: string }> {
  if (!Number.isInteger(id) || id < 1) return { error: "Invalid inbox item." };
  const email = getInboxEmail(id);
  if (!email) return { error: "Inbox item not found." };
  if (email.status !== "new") return { error: "This inbox item was already handled." };
  if (!email.deal_id) return { error: "Counterpart could not safely choose a deal for this email." };

  const existingMessageIds = new Set(getMessages(email.deal_id).map((message) => message.id));
  const result = await addTheirReply(email.deal_id, email.body);
  const wasSaved = !result.error || result.error.startsWith("Message saved");
  if (!wasSaved) return { error: result.error };

  const importedMessage = [...getMessages(email.deal_id)]
    .reverse()
    .find(
      (message) =>
        !existingMessageIds.has(message.id) &&
        message.sender === "them" &&
        message.body.trim() === email.body.trim()
    );
  setInboundEmailStatus({ id, status: "imported", importedMessageId: importedMessage?.id });
  revalidatePath("/inbox");
  revalidatePath(`/deals/${email.deal_id}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return { notice: result.error ?? "Reply added to the deal. Counterpart is drafting the next move." };
}

export async function matchInboxEmailToDealAction(
  id: number,
  dealId: number,
  rememberSender: boolean
): Promise<{ notice?: string; error?: string }> {
  if (!Number.isInteger(id) || id < 1) return { error: "Invalid inbox item." };
  if (!Number.isInteger(dealId) || dealId < 1) return { error: "Choose a valid deal." };
  const email = getInboxEmail(id);
  if (!email) return { error: "Inbox item not found." };
  if (email.status !== "new") return { error: "This inbox item was already handled." };
  const deal = getDeal(dealId);
  if (!deal || TERMINAL_STAGES.includes(deal.stage) || deal.stage === "agreed") {
    return { error: "Choose an active negotiation." };
  }

  if (rememberSender) {
    const senderEmail = normalizeEmail(email.from_email);
    if (!senderEmail) return { error: "This message has no valid sender address to remember." };
    if (!deal.partner_id) return { error: "This deal is not linked to a partner yet." };
    const existingPartner = findPartnerByEmail(senderEmail);
    if (existingPartner && existingPartner.id !== deal.partner_id) {
      return { error: `${senderEmail} is already saved on ${existingPartner.name}.` };
    }
    addPartnerContact({
      partnerId: deal.partner_id,
      email: senderEmail,
      label: "Agency/contact",
      source: "gmail-manual",
    });
  }

  setInboundEmailMatch({
    id,
    partnerId: deal.partner_id,
    dealId: deal.id,
    matchKind: "deal",
    matchMethod: "manual",
    bucket: "priority",
  });
  const imported = await addInboxEmailToDealAction(id);
  if (imported.error) return imported;
  return {
    notice: rememberSender
      ? "Reply added, and this sender will match the creator automatically next time."
      : imported.notice,
  };
}

export async function ignoreInboxEmailAction(id: number): Promise<{ error?: string }> {
  if (!Number.isInteger(id) || id < 1) return { error: "Invalid inbox item." };
  const email = getInboxEmail(id);
  if (!email || email.status !== "new") return { error: "This inbox item was already handled." };
  setInboundEmailStatus({ id, status: "ignored" });
  revalidatePath("/inbox");
  return {};
}
