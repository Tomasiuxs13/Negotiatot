import {
  addPartnerContact,
  findPartnerByEmail,
  getDeal,
  getGmailConnection,
  getPartner,
  inTransaction,
  saveEmailThreadLink,
} from "@/lib/db";
import { normalizeEmail } from "@/lib/creator-identity";
import {
  extensionAuthError,
  extensionJson,
  extensionPreflight,
  extensionRequestBody,
} from "@/lib/extension-api";
import { extensionContacts, gmailExtensionContext } from "@/lib/gmail-extension";
import { TERMINAL_STAGES } from "@/lib/types";

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
  const threadId = typeof input.threadId === "string" ? input.threadId.trim().slice(0, 300) : "";
  const senderEmail = normalizeEmail(typeof input.senderEmail === "string" ? input.senderEmail : null);
  const contacts = extensionContacts(input.contacts);
  const rememberSender = input.rememberSender === true;

  if (!Number.isInteger(dealId) || dealId < 1) {
    return extensionJson({ error: "Choose a valid deal." }, { status: 400 });
  }
  if (!threadId) {
    return extensionJson({ error: "Counterpart could not identify this Gmail conversation." }, { status: 400 });
  }
  const deal = getDeal(dealId);
  if (!deal || !deal.partner_id || deal.stage === "agreed" || TERMINAL_STAGES.includes(deal.stage)) {
    return extensionJson({ error: "Choose an active negotiation." }, { status: 409 });
  }
  const partner = getPartner(deal.partner_id);
  if (!partner) return extensionJson({ error: "The deal's creator no longer exists." }, { status: 409 });

  if (senderEmail) {
    const senderPartner = findPartnerByEmail(senderEmail);
    if (senderPartner && senderPartner.id !== partner.id) {
      return extensionJson(
        { error: `${senderEmail} is already saved on ${senderPartner.name}.` },
        { status: 409 }
      );
    }
  }
  if (rememberSender) {
    if (!senderEmail || !contacts.includes(senderEmail)) {
      return extensionJson({ error: "The visible sender address could not be verified." }, { status: 400 });
    }
    const accountEmail = normalizeEmail(getGmailConnection()?.accountEmail ?? null);
    if (accountEmail && senderEmail === accountEmail) {
      return extensionJson({ error: "Your own Gmail address cannot be saved as a creator contact." }, { status: 400 });
    }
  }

  inTransaction(() => {
    saveEmailThreadLink({
      provider: "gmail",
      providerThreadId: threadId,
      partnerId: partner.id,
      dealId: deal.id,
      source: "gmail-extension",
    });
    if (rememberSender && senderEmail) {
      addPartnerContact({
        partnerId: partner.id,
        email: senderEmail,
        label: "Agency/contact",
        source: "gmail-extension",
      });
    }
  });

  const context = gmailExtensionContext(contacts, threadId, senderEmail);
  if (context.status !== "matched" || context.deal.id !== deal.id) {
    return extensionJson({ error: "The conversation could not be linked safely." }, { status: 409 });
  }
  return extensionJson({
    ...context,
    rememberedSender: rememberSender,
  });
}
