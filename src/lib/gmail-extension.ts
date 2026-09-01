import "server-only";

import {
  findPartnerByEmail,
  getDeal,
  getDeals,
  getEmailThreadLink,
  getGmailConnection,
  getMessages,
  getPartner,
  getPartnerDeals,
} from "./db";
import {
  filterExtensionDealOptions,
  latestExtensionRecommendation,
  resolveExtensionIdentity,
  type ExtensionDealOption,
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

function extensionThreadId(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 300) : null;
}

export function gmailExtensionDealOptions(rawQuery: unknown): ExtensionDealOption[] {
  const deals = getDeals();
  const partners = new Map(
    deals
      .map((deal) => deal.partner_id)
      .filter((partnerId): partnerId is number => partnerId != null)
      .map((partnerId) => [partnerId, getPartner(partnerId)])
  );
  const options = deals
    .filter(
      (deal) =>
        deal.partner_id != null &&
        deal.stage !== "agreed" &&
        !TERMINAL_STAGES.includes(deal.stage)
    )
    .map((deal): ExtensionDealOption | null => {
      const partner = partners.get(deal.partner_id!);
      return partner
        ? {
            id: deal.id,
            creator: deal.creator,
            stage: deal.stage,
            campaign: deal.campaign,
            partnerId: partner.id,
            partnerName: partner.name,
          }
        : null;
    })
    .filter((deal): deal is ExtensionDealOption => deal != null);
  return filterExtensionDealOptions(options, typeof rawQuery === "string" ? rawQuery : "", 500);
}

export function gmailExtensionContext(
  rawContacts: unknown,
  rawThreadId?: unknown,
  rawSenderEmail?: unknown
) {
  const contacts = extensionContacts(rawContacts);
  const senderEmail = normalizeEmail(typeof rawSenderEmail === "string" ? rawSenderEmail : null);
  const senderPartner = senderEmail ? findPartnerByEmail(senderEmail) : undefined;
  const accountEmail = normalizeEmail(getGmailConnection()?.accountEmail ?? null);
  const sentByManager = Boolean(senderEmail && accountEmail && senderEmail === accountEmail);
  const unresolvedTracking = {
    matchMethod: null,
    automatic: false,
    senderEmail,
    sentByManager,
  };
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
  const threadId = extensionThreadId(rawThreadId);
  const link = threadId ? getEmailThreadLink("gmail", threadId) : undefined;
  const linkedDeal = link ? getDeal(link.deal_id) : undefined;
  const linkedPartner = link ? getPartner(link.partner_id) : undefined;
  const activeLink =
    link &&
    linkedDeal &&
    linkedPartner &&
    linkedDeal.partner_id === linkedPartner.id &&
    linkedDeal.stage !== "agreed" &&
    !TERMINAL_STAGES.includes(linkedDeal.stage)
      ? { link, deal: linkedDeal, partner: linkedPartner }
      : null;

  let selectedDealId: number | null = null;
  let selectedPartnerId: number | null = null;
  let matchMethod: "email" | "thread_manual" = "email";

  if (identity.status === "matched") {
    selectedDealId = identity.deal.id;
    selectedPartnerId = identity.partner.partnerId;
  } else if (activeLink) {
    // A deliberate thread link may disambiguate a group conversation. A sender that is
    // already owned by a different partner is the exception: never override that identity.
    if (senderPartner && senderPartner.id !== activeLink.partner.id) {
      return { ...identity, contacts, tracking: unresolvedTracking };
    }
    selectedDealId = activeLink.deal.id;
    selectedPartnerId = activeLink.partner.id;
    matchMethod = "thread_manual";
  } else {
    return { ...identity, contacts, tracking: unresolvedTracking };
  }

  // Read the full deal only after identity has resolved to exactly one live record.
  const deal = getPartnerDeals(selectedPartnerId).find(
    (candidate) => candidate.id === selectedDealId
  );
  if (!deal) return { status: "unmatched" as const, contacts, tracking: unresolvedTracking };
  const partner = getPartner(selectedPartnerId);
  if (!partner) return { status: "unmatched" as const, contacts, tracking: unresolvedTracking };

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

  const automatic = sentByManager
    ? identity.status === "matched" && identity.partner.partnerId === partner.id
    : senderPartner?.id === partner.id;

  return {
    status: "matched" as const,
    contacts,
    partner: {
      id: partner.id,
      name: partner.name,
      email: partner.email,
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
    tracking: {
      matchMethod,
      automatic,
      senderEmail,
      sentByManager,
    },
  };
}
