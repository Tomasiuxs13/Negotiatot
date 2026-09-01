import { addTheirReply } from "@/app/deals/[id]/actions";
import {
  getDeal,
  getInboundEmail,
  getMessages,
  saveInboundEmail,
  setInboundEmailStatus,
} from "@/lib/db";
import {
  extensionAuthError,
  extensionJson,
  extensionPreflight,
  extensionRequestBody,
} from "@/lib/extension-api";
import { gmailExtensionContext } from "@/lib/gmail-extension";

export function OPTIONS() {
  return extensionPreflight();
}

export async function POST(request: Request) {
  const authError = extensionAuthError(request);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await extensionRequestBody(request);
  } catch (error) {
    return extensionJson(
      { error: error instanceof Error ? error.message : "Body must be JSON." },
      { status: 400 }
    );
  }
  if (!body || typeof body !== "object") {
    return extensionJson({ error: "Body must be a JSON object." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const dealId = Number(input.dealId);
  const text = typeof input.body === "string" ? input.body.trim() : "";
  const fingerprint = typeof input.fingerprint === "string" ? input.fingerprint : "";
  const subject = typeof input.subject === "string" ? input.subject.slice(0, 500) : null;
  const threadId = typeof input.threadId === "string" ? input.threadId.slice(0, 300) : null;
  const senderEmail = typeof input.senderEmail === "string" ? input.senderEmail : null;

  if (!Number.isInteger(dealId) || dealId < 1) {
    return extensionJson({ error: "Choose a matched deal first." }, { status: 400 });
  }
  if (!text) return extensionJson({ error: "The latest message is empty." }, { status: 400 });
  if (text.length > 40_000) {
    return extensionJson({ error: "The latest message is too long." }, { status: 400 });
  }
  if (!/^[a-f0-9]{64}$/i.test(fingerprint)) {
    return extensionJson({ error: "Message fingerprint is invalid." }, { status: 400 });
  }

  // Re-resolve identity at write time. A stale sidebar must not attach a message after
  // the database or Gmail thread changed underneath it.
  const context = gmailExtensionContext(input.contacts, input.threadId, input.senderEmail);
  if (context.status !== "matched" || context.deal.id !== dealId) {
    return extensionJson(
      { error: "Counterpart can no longer match this thread to exactly one live deal." },
      { status: 409 }
    );
  }

  const providerMessageId = `extension:${fingerprint.toLowerCase()}`;
  const existing = getInboundEmail("gmail", providerMessageId);
  if (existing?.status === "imported") {
    return extensionJson({ ok: true, duplicate: true, dealId });
  }

  let inboxId = existing?.id ?? 0;
  if (!existing) {
    inboxId = saveInboundEmail({
      provider: "gmail",
      providerMessageId,
      providerThreadId: threadId,
      fromEmail: senderEmail,
      subject,
      body: text,
      receivedAt: new Date().toISOString(),
      partnerId: context.partner.id,
      dealId,
      matchKind: "deal",
    });
  }

  // Recover safely if the request previously added the message but stopped before it
  // marked the inbox row imported.
  const alreadyRecorded = [...getMessages(dealId)]
    .reverse()
    .find((message) => message.sender === "them" && message.body.trim() === text);
  if (alreadyRecorded) {
    if (inboxId) {
      setInboundEmailStatus({ id: inboxId, status: "imported", importedMessageId: alreadyRecorded.id });
    }
    return extensionJson({ ok: true, duplicate: true, dealId });
  }

  const result = await addTheirReply(dealId, text);
  const saved = !result.error || result.error.startsWith("Message saved");
  if (!saved) {
    if (inboxId) setInboundEmailStatus({ id: inboxId, status: "ignored" });
    return extensionJson({ error: result.error }, { status: 409 });
  }

  const imported = [...getMessages(dealId)]
    .reverse()
    .find((message) => message.sender === "them" && message.body.trim() === text);
  if (inboxId) {
    setInboundEmailStatus({
      id: inboxId,
      status: "imported",
      importedMessageId: imported?.id ?? null,
    });
  }
  const deal = getDeal(dealId);
  return extensionJson({
    ok: true,
    dealId,
    drafting: deal?.job_status === "recommending",
    notice: result.error ?? null,
  });
}
