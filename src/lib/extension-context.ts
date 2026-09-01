import type { CopilotReco, Stage } from "./types";

export interface ExtensionDealCandidate {
  id: number;
  creator: string;
  stage: Stage;
}

export interface ExtensionDealOption extends ExtensionDealCandidate {
  campaign: string | null;
  partnerId: number;
  partnerName: string;
}

/** Small, deterministic client search for the private Gmail deal picker. */
export function filterExtensionDealOptions(
  deals: ExtensionDealOption[],
  query: string,
  limit = 20
): ExtensionDealOption[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return deals
    .filter((deal) => {
      if (terms.length === 0) return true;
      const haystack = [deal.creator, deal.partnerName, deal.campaign, deal.stage]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, Math.max(1, limit));
}

export interface ExtensionPartnerCandidate {
  partnerId: number;
  name: string;
  email: string | null;
  liveDeals: ExtensionDealCandidate[];
}

export type ExtensionIdentityMatch =
  | { status: "unmatched" }
  | { status: "partner_only"; partner: ExtensionPartnerCandidate }
  | { status: "ambiguous"; partners: ExtensionPartnerCandidate[] }
  | {
      status: "matched";
      partner: ExtensionPartnerCandidate;
      deal: ExtensionDealCandidate;
    };

/**
 * Identity stays deterministic at the browser boundary.
 *
 * Gmail threads contain our own address, the creator, and sometimes an agency. Matching
 * several addresses to the same partner is safe; matching them to different partners or
 * finding several live deals is not. The extension must surface that ambiguity instead
 * of letting the model choose a convenient record.
 */
export function resolveExtensionIdentity(
  candidates: ExtensionPartnerCandidate[]
): ExtensionIdentityMatch {
  const unique = [...new Map(candidates.map((candidate) => [candidate.partnerId, candidate])).values()];
  if (unique.length === 0) return { status: "unmatched" };
  if (unique.length > 1) return { status: "ambiguous", partners: unique };

  const partner = unique[0];
  if (partner.liveDeals.length === 0) return { status: "partner_only", partner };
  if (partner.liveDeals.length > 1) return { status: "ambiguous", partners: [partner] };
  return { status: "matched", partner, deal: partner.liveDeals[0] };
}

export interface ExtensionRecommendation {
  messageId: number;
  headline: string;
  proposedOffer: number;
  drafts: CopilotReco["drafts"];
}

/** A corrupt or old Copilot message must not break the whole Gmail sidebar. */
export function latestExtensionRecommendation(
  messages: { id: number; sender: string; meta: string | null }[]
): ExtensionRecommendation | null {
  for (const message of [...messages].reverse()) {
    if (message.sender !== "copilot" || !message.meta) continue;
    try {
      const parsed = JSON.parse(message.meta) as Partial<CopilotReco>;
      if (
        typeof parsed.headline !== "string" ||
        typeof parsed.proposedOffer !== "number" ||
        !parsed.drafts ||
        typeof parsed.drafts.balanced !== "string" ||
        typeof parsed.drafts.warm !== "string" ||
        typeof parsed.drafts.firm !== "string"
      ) {
        continue;
      }
      return {
        messageId: message.id,
        headline: parsed.headline,
        proposedOffer: parsed.proposedOffer,
        drafts: parsed.drafts,
      };
    } catch {
      // Try the next older recommendation. Historical rows predate the current schema.
    }
  }
  return null;
}
