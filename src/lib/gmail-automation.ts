import type { Deal, Stage } from "./types";
import { TERMINAL_STAGES } from "./types";

const NEGOTIATION_STAGES: Stage[] = [
  "lead",
  "contacted",
  "analyzing",
  "offer_sent",
  "negotiating",
];

type MatchableDeal = Pick<Deal, "id" | "stage" | "round" | "contacted_at">;

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
    stage:
      deal.stage === "offer_sent" || deal.stage === "analyzing"
        ? "negotiating"
        : deal.stage,
    status_label: `Round ${round} · your move`,
    status_tone: "warn",
  };
}
