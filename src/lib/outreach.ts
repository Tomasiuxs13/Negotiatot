import type { Deal, Message } from "./types";
import { shortAgo } from "./format";

/**
 * What has actually been sent to a creator we reached out to, and when.
 *
 * "Reached out · awaiting reply" was the same sentence on day one and day thirty, and
 * said nothing about the two follow-ups already sent. What a manager needs from a
 * contacted card is which touch this is and how long ago it went — that is the whole
 * decision: chase again, or drop it.
 *
 * Counted from the thread rather than a counter column: a follow-up is recorded as an
 * outbound message, so the count and its dates cannot drift from the conversation the
 * deal page shows.
 */
export interface OutreachStatus {
  /** 0 while only the first outreach has gone out. */
  followUps: number;
  /** The last thing WE sent — the outreach itself, or the newest follow-up. */
  lastTouchAt: string | null;
  /** "Reached out" · "Follow-up 2" */
  label: string;
  /** The line for a card or a table cell: "Follow-up 2 · 3d ago". */
  line: string;
}

export function outreachStatus(
  deal: Pick<Deal, "stage" | "contacted_at" | "updated_at">,
  messages: Message[],
  today?: string
): OutreachStatus | null {
  if (deal.stage !== "contacted") return null;

  const outbound = messages
    .filter((m) => m.sender === "us")
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
  const followUps = outbound.length;
  // No outbound message means nothing has been logged since the outreach itself, so the
  // stage stamp is the last touch. updated_at is the fallback for rows that predate it.
  const lastTouchAt = outbound.at(-1)?.created_at ?? deal.contacted_at ?? deal.updated_at ?? null;
  const label = followUps === 0 ? "Reached out" : `Follow-up ${followUps}`;
  const since = shortAgo(lastTouchAt, today);
  return {
    followUps,
    lastTouchAt,
    label,
    line: since ? `${label} · ${since}` : label,
  };
}
