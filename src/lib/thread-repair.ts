/**
 * What deleting a negotiation message must repair.
 *
 * A message is never just a row: pasting a creator reply bumps the round, hands you the
 * move, and usually triggers a Copilot recommendation that reads the ask out of it and
 * stamps it on the deal. So when a message pasted into the WRONG deal is removed, the
 * deal has to be rewound to what the remaining thread supports — otherwise the ghost of
 * the wrong message lives on as a $1,500 current_ask with nothing behind it.
 *
 * Pure: messages in, field patch out.
 */

import type { Message } from "./types";

export interface ThreadRepair {
  round: number;
  your_move: 0 | 1;
  /** Set (possibly to null) only when the remaining thread cannot support an ask. */
  first_ask?: null;
  current_ask?: null;
  /** Only present when the stage itself is no longer supportable. */
  stage?: "offer_sent" | "analyzing" | "contacted";
  /** Null means "leave the label alone". */
  status_label: string | null;
}

/**
 * Recommendations are derived from the thread they were generated against. Any copilot
 * message newer than the deleted one was computed from a thread that contained it, so it
 * inherits the wrongness and goes too. Older ones predate the mistake and stay.
 */
export function dependentCopilotIds(messages: Message[], deletedId: number): number[] {
  return messages
    .filter((m) => m.sender === "copilot" && m.id > deletedId)
    .map((m) => m.id);
}

export function repairThread(
  remaining: Message[],
  deal: { stage: string; analysis: string | null; status_label: string | null }
): ThreadRepair {
  const theirCount = remaining.filter((m) => m.sender === "them").length;
  const lastHuman = [...remaining].reverse().find((m) => m.sender !== "copilot");

  const repair: ThreadRepair = {
    round: theirCount,
    your_move: lastHuman?.sender === "them" ? 1 : 0,
    status_label: null,
  };

  // Asks only ever come from them. With no message of theirs left, an ask on the deal
  // is a number nothing supports.
  if (theirCount === 0) {
    repair.first_ask = null;
    repair.current_ask = null;
  }

  // "Negotiating" claims an exchange. With their side of it gone, fall back to whatever
  // the remaining facts still prove: our offer went out, or an analysis exists, or we
  // only ever reached out.
  if (deal.stage === "negotiating" && theirCount === 0) {
    repair.stage = remaining.some((m) => m.sender === "us")
      ? "offer_sent"
      : deal.analysis
        ? "analyzing"
        : "contacted";
  }

  const stage = repair.stage ?? deal.stage;
  if (repair.round > 0) {
    repair.status_label = `Round ${repair.round} · ${repair.your_move ? "your move" : "waiting on them"}`;
  } else if (stage === "offer_sent") {
    repair.status_label = "Offer sent · waiting on them";
  } else if (stage === "contacted") {
    repair.status_label = "Reached out · awaiting reply";
  }

  return repair;
}
