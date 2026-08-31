"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { addTheirReply } from "@/app/deals/[id]/actions";
import { getInboxEmail, setInboundEmailStatus } from "@/lib/db";
import { syncGmailAutomation, syncGmailInbox } from "@/lib/gmail";

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

  const result = await addTheirReply(email.deal_id, email.body);
  const wasSaved = !result.error || result.error.startsWith("Message saved");
  if (!wasSaved) return { error: result.error };

  setInboundEmailStatus({ id, status: "imported" });
  revalidatePath("/inbox");
  revalidatePath(`/deals/${email.deal_id}`);
  revalidatePath("/");
  revalidatePath("/pipeline");
  return { notice: result.error ?? "Reply added to the deal. Counterpart is drafting the next move." };
}

export async function ignoreInboxEmailAction(id: number): Promise<{ error?: string }> {
  if (!Number.isInteger(id) || id < 1) return { error: "Invalid inbox item." };
  const email = getInboxEmail(id);
  if (!email || email.status !== "new") return { error: "This inbox item was already handled." };
  setInboundEmailStatus({ id, status: "ignored" });
  revalidatePath("/inbox");
  return {};
}
