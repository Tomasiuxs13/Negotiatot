import type { Deal, Message } from "./types";

/**
 * A follow-up is deliberately conservative: it only begins after three full calendar
 * days and only while the deal says the creator has the ball. This makes the rule
 * explainable to a manager and, importantly, lets a normal page edit stay unrelated
 * to the timer.
 */
export const DEFAULT_FOLLOW_UP_DELAY_DAYS = 3;

/**
 * Outreach waits longer than a live conversation. Nobody owes you a reply to a first
 * email in three days, and chasing that fast is how a promising creator learns to
 * ignore you.
 */
export const OUTREACH_FOLLOW_UP_DELAY_DAYS = 5;

export interface FollowUpState {
  deal_id: number;
  anchor_message_id: number | null;
  anchor_at: string;
  snoozed_until: string;
  updated_at: string;
}

export interface FollowUpCandidate {
  dealId: number;
  creator: string;
  stage: "contacted" | "offer_sent" | "negotiating";
  /** Which chase this would be: 1 for the first one after the outreach itself. */
  followUpNumber: number;
  /** The outbound message that started the waiting window; null for legacy threads. */
  anchorMessageId: number | null;
  anchorAt: string;
  daysWaiting: number;
  draft: string;
}

function calendarDaysBetween(from: string, to: string): number {
  const start = new Date(`${from.slice(0, 10)}T00:00:00Z`).getTime();
  const end = new Date(`${to.slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

function latestOutbound(messages: Message[]): Message | undefined {
  return messages
    .filter((message) => message.sender === "us")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    .at(-1);
}

function lastConversationMessage(messages: Message[]): Message | undefined {
  return messages
    .filter((message) => message.sender !== "copilot")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
    .at(-1);
}

function followUpDraft(
  creator: string,
  stage: FollowUpCandidate["stage"],
  followUpNumber: number
): string {
  if (stage === "contacted") {
    // A second chase that reads like the first one is what gets a sender filtered. The
    // last one says so plainly, which is both more honest and more likely to be answered.
    if (followUpNumber >= 2) {
      return `Hi ${creator},\n\nLast note from me on this — I know inboxes get busy. If a collaboration isn't the right fit right now, no problem at all; just let me know and I'll close it out. If the timing is simply off, tell me when to come back and I will.\n\nBest,`;
    }
    return `Hi ${creator},\n\nJust floating my note back to the top of your inbox in case it got buried. We'd love to work with you and I'm happy to share the details, budget range and timing — or answer anything that would help you decide.\n\nBest,`;
  }

  if (stage === "offer_sent") {
    return `Hi ${creator},\n\nI wanted to follow up on the proposal I sent. We’d love to work together and are happy to answer any questions or talk through the details.\n\nBest,`;
  }

  return `Hi ${creator},\n\nJust following up on our last conversation. We’re still interested in working together and happy to resolve any remaining details. Let me know if you’d like to continue the conversation.\n\nBest,`;
}

function stateMatchesAnchor(
  state: FollowUpState,
  anchorMessageId: number | null,
  anchorAt: string
): boolean {
  return (
    state.anchor_message_id === anchorMessageId &&
    state.anchor_at === anchorAt
  );
}

/**
 * Returns the one proposed follow-up for a live deal, if the creator has been quiet
 * long enough. A manager's snooze follows a specific outbound message, so a newly sent
 * offer starts a fresh waiting window instead of remaining hidden by an old snooze.
 */
export function getFollowUpCandidate(
  deal: Deal,
  messages: Message[],
  state?: FollowUpState | null,
  options: {
    today?: string;
    delayDays?: number;
  } = {}
): FollowUpCandidate | null {
  const stage = deal.stage;
  if (
    (stage !== "contacted" && stage !== "offer_sent" && stage !== "negotiating") ||
    deal.your_move === 1
  ) {
    return null;
  }

  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const delayDays =
    options.delayDays ??
    (stage === "contacted" ? OUTREACH_FOLLOW_UP_DELAY_DAYS : DEFAULT_FOLLOW_UP_DELAY_DAYS);
  const outbound = latestOutbound(messages);
  const lastConversation = lastConversationMessage(messages);

  // A reply after the last outbound note always wins, even if a legacy row's move flag
  // was not updated when it was imported.
  if (lastConversation && lastConversation.sender !== "us") return null;

  // Older deals do not have an outbound message in Counterpart yet. Their last known
  // hand-off time is the least surprising fallback until the manager records one. For
  // outreach that is contacted_at: the email left from the manager's own client, so the
  // stage stamp is the only record that anything was ever sent.
  const anchorAt =
    outbound?.created_at ?? (stage === "contacted" ? deal.contacted_at : null) ?? deal.updated_at;
  const anchorMessageId = outbound?.id ?? null;
  const daysWaiting = calendarDaysBetween(anchorAt, today);
  if (daysWaiting < delayDays) return null;

  if (
    state &&
    stateMatchesAnchor(state, anchorMessageId, anchorAt) &&
    state.snoozed_until >= today
  ) {
    return null;
  }

  const followUpNumber = messages.filter((m) => m.sender === "us").length + 1;
  return {
    dealId: deal.id,
    creator: deal.creator,
    stage,
    followUpNumber,
    anchorMessageId,
    anchorAt,
    daysWaiting,
    draft: followUpDraft(deal.creator, stage, followUpNumber),
  };
}

/** Builds candidates without leaking persistence concerns into dashboard UI rules. */
export function getFollowUpCandidates(
  deals: Deal[],
  messagesByDeal: Map<number, Message[]>,
  statesByDeal: Map<number, FollowUpState>,
  options: { today?: string; delayDays?: number } = {}
): FollowUpCandidate[] {
  return deals.flatMap((deal) => {
    const candidate = getFollowUpCandidate(
      deal,
      messagesByDeal.get(deal.id) ?? [],
      statesByDeal.get(deal.id),
      options
    );
    return candidate ? [candidate] : [];
  });
}

export function dateAfterDays(today: string, days: number): string {
  const date = new Date(`${today.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
