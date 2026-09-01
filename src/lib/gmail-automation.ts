import type { Deal, Stage } from "./types";
import { TERMINAL_STAGES } from "./types";
import { stageAfterOffer, stageAfterTheirReply } from "./stage-advance";

const NEGOTIATION_STAGES: Stage[] = [
  "lead",
  "contacted",
  "analyzing",
  "offer_sent",
  "negotiating",
];

type MatchableDeal = Pick<Deal, "id" | "stage" | "round" | "contacted_at" | "current_offer">;

/**
 * Mail automation is intentionally stricter than the inbox review queue. There must be
 * exactly one non-terminal deal for the partner, and it must still be in negotiation.
 * An agreed collaboration plus a new lead is ambiguous even if only the lead can move.
 */
export function automaticGmailDeal<T extends MatchableDeal>(deals: T[]): T | null {
  const live = deals.filter((deal) => !TERMINAL_STAGES.includes(deal.stage));
  if (live.length !== 1 || !NEGOTIATION_STAGES.includes(live[0].stage)) return null;
  return live[0];
}

/** Sent mail only advances the earliest stage; it never rewinds or skips later work. */
export function automaticSentStageUpdate(
  deal: MatchableDeal,
  sentAt: string
): Record<string, unknown> | null {
  if (deal.stage !== "lead") return null;
  return {
    stage: "contacted",
    contacted_at: deal.contacted_at ?? sentAt,
    status_label: "Reached out · awaiting reply",
    status_tone: "neutral",
    your_move: 0,
  };
}

/** Mirrors a recorded creator reply without starting a paid Copilot run. */
export function automaticReplyStageUpdate(deal: MatchableDeal): Record<string, unknown> {
  const round = deal.round + 1;
  return {
    round,
    your_move: 1,
    // Same rule as a pasted reply: their first message is an ask to be priced, and only
    // becomes a negotiation once a number of ours is on the table.
    stage: stageAfterTheirReply(deal.stage, deal.current_offer != null),
    status_label: `Round ${round} · your move`,
    status_tone: "warn",
  };
}

/**
 * Does this sent email actually contain the figure the Copilot proposed?
 *
 * The sync knows an email went out; it does not know what was in it. Adopting the last
 * recommendation's number on the strength of "an email was sent" would write a price
 * nobody quoted — so the number has to appear, with a currency marker, in the words that
 * were actually sent. A bare "600" is not enough: that is a view count, a phone number or
 * a year as often as it is a fee.
 */
export function offerConfirmedBySentEmail(
  body: string,
  proposedOffer: number | null | undefined
): number | null {
  if (proposedOffer == null || !Number.isFinite(proposedOffer) || proposedOffer <= 0) return null;
  const rounded = Math.round(proposedOffer);
  const plain = String(rounded);
  const grouped = rounded.toLocaleString("en-US");
  const forms = [...new Set([plain, grouped])].map((form) =>
    form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const pattern = new RegExp(
    `(?:\\$\\s?|usd\\s?)(?:${forms.join("|")})(?:\\.00)?(?![\\d.,])|(?:${forms.join("|")})(?:\\.00)?\\s?(?:usd|dollars)\\b`,
    "i"
  );
  return pattern.test(body) ? rounded : null;
}

/**
 * The deal fields a confirmed outbound offer sets.
 *
 * Everything the manual "Mark as sent" button writes except the guard: this is a record
 * of an email that has already left, and refusing to write down a price because it breaks
 * a ceiling would not un-send it — it would only mean the app's history is wrong.
 */
export function automaticOfferUpdate(
  deal: MatchableDeal & { current_offer: number | null; stage: Stage },
  confirmedOffer: number
): Record<string, unknown> | null {
  if (deal.current_offer === confirmedOffer) return null;
  return {
    current_offer: confirmedOffer,
    your_move: 0,
    stage: stageAfterOffer(deal.stage),
    status_label: `Round ${Math.max(deal.round, 1)} · waiting on them`,
    status_tone: "neutral",
  };
}
