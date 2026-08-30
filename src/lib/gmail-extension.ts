import "server-only";

import {
  findPartnerByEmail,
  getMessages,
  getPartnerDeals,
} from "./db";
import {
  latestExtensionRecommendation,
  resolveExtensionIdentity,
  type ExtensionPartnerCandidate,
} from "./extension-context";
import { normalizeEmail } from "./creator-identity";
import { TERMINAL_STAGES } from "./types";

export function extensionContacts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .slice(0, 50)
        .map((entry) => normalizeEmail(typeof entry === "string" ? entry : null))
        .filter((entry): entry is string => entry != null)
    ),
  ];
}

export function gmailExtensionContext(rawContacts: unknown) {
  const contacts = extensionContacts(rawContacts);
  const candidates = contacts
    .map((email): ExtensionPartnerCandidate | null => {
      const partner = findPartnerByEmail(email);
      if (!partner) return null;
      return {
        partnerId: partner.id,
        name: partner.name,
        email: partner.email,
        liveDeals: getPartnerDeals(partner.id)
          .filter((deal) => !TERMINAL_STAGES.includes(deal.stage))
          .map((deal) => ({ id: deal.id, creator: deal.creator, stage: deal.stage })),
      };
    })
    .filter((candidate): candidate is ExtensionPartnerCandidate => candidate != null);

  const identity = resolveExtensionIdentity(candidates);
  if (identity.status !== "matched") {
    return { ...identity, contacts };
  }

  // Read the full deal only after identity has resolved to exactly one live record.
  const deal = getPartnerDeals(identity.partner.partnerId).find(
    (candidate) => candidate.id === identity.deal.id
  );
  if (!deal) return { status: "unmatched" as const, contacts };

  const messages = getMessages(deal.id);
  const recentMessages = messages
    .filter((message) => message.sender !== "copilot")
    .slice(-8)
    .map((message) => ({
      id: message.id,
      sender: message.sender,
      body: message.body.slice(0, 2_000),
      createdAt: message.created_at,
    }));

  return {
    status: "matched" as const,
    contacts,
    partner: {
      id: identity.partner.partnerId,
      name: identity.partner.name,
      email: identity.partner.email,
    },
    deal: {
      id: deal.id,
      creator: deal.creator,
      stage: deal.stage,
      round: deal.round,
      campaign: deal.campaign,
      statusLabel: deal.status_label,
      yourMove: Boolean(deal.your_move),
      currentAsk: deal.current_ask,
      currentOffer: deal.current_offer,
      target: deal.target,
      walkaway: deal.walkaway,
      jobStatus: deal.job_status,
    },
    recentMessages,
    recommendation: latestExtensionRecommendation(messages),
  };
}
