import type { Stage } from "./types";
import { isOpenStage } from "./types";

/**
 * Where a deal lands after something real happens to it.
 *
 * The stages were right; nothing moved a deal through them. Every promotion was written
 * for a deal that started at Analyzing: a reply advanced only an offer_sent or analyzing
 * deal, and sending an offer promoted only from analyzing. On the path this app is
 * actually used for — outreach carrying no number, their rate comes back, you price it,
 * you counter — a deal could therefore sit in "Reached out · awaiting reply" through
 * both the reply and the counter-offer.
 *
 * Only the conversation moves a deal. Running the analysis deliberately does NOT: nine
 * of the thirty-seven contacted deals here were priced before the creator ever answered,
 * and promoting those to "To review" would claim a decision was waiting on the manager
 * when the deal was really still waiting on the creator. The stage tracks what the two
 * sides have said to each other, not which tools have been run.
 *
 * Pure and in one place so the entry points — a pasted reply, a Gmail-synced reply, an
 * offer — cannot disagree about it.
 */

/** After Agreed a stage is a record, not a step — those never move from here. */
function settled(stage: Stage): boolean {
  return !isOpenStage(stage);
}

/** Our number is out. Sent from any pre-offer stage, that is what Offer sent means. */
export function stageAfterOffer(stage: Stage): Stage {
  if (settled(stage)) return stage;
  return stage === "negotiating" ? "negotiating" : "offer_sent";
}

/**
 * Their message lands. Which stage that means depends on whether a number of ours is
 * already on the table: their first reply is an ask to be priced, not a counter to be
 * negotiated — there is nothing yet to negotiate against.
 */
export function stageAfterTheirReply(stage: Stage, hasOurOffer: boolean): Stage {
  if (settled(stage)) return stage;
  if (stage === "offer_sent" || stage === "negotiating") return "negotiating";
  // Their first reply lands in "In contact", not "To review": they have answered, but
  // nothing is priced, so no decision is waiting on the manager yet. "To review" used to
  // absorb both and so claimed a decision was ready when it was not.
  return hasOurOffer ? "negotiating" : "in_contact";
}

/**
 * Pricing lands. This is the one place a tool moves a deal, and it is what makes
 * "To review" mean what it says: evidence and a price exist, and the next move is the
 * manager's. A deal already past pricing is left alone — re-running the analysis on a
 * live negotiation must not drag it backwards.
 */
export function stageAfterAnalysis(stage: Stage): Stage {
  if (settled(stage)) return stage;
  return stage === "lead" || stage === "contacted" || stage === "in_contact"
    ? "analyzing"
    : stage;
}

/**
 * The signed contract is confirmed, so delivery obligations are real and dated. That is
 * the moment Agreed becomes Active — "we shook hands" and "they are filming and we owe
 * them money" are different questions to ask of a board.
 */
export function stageAfterContractConfirmed(stage: Stage): Stage {
  return stage === "agreed" ? "active" : stage;
}
