import type { Message } from "./types";

/**
 * Whether the Copilot's move is behind the conversation.
 *
 * The recommendation engine already reads the whole logged thread, so a reply that
 * arrived through the Gmail sync is available to it the moment it lands. What was
 * missing was anything that *asks* for a new move: pasting a reply was the only path
 * that triggered one, so a message the app had logged automatically still had to be
 * typed in again to get a draft. This says when to offer that trigger.
 *
 * True when their newest message is newer than the newest recommendation — including
 * the case where no recommendation exists yet.
 */
export function recommendationIsBehind(messages: Message[]): boolean {
  const theirs = latestOf(messages, (m) => m.sender === "them");
  if (!theirs) return false;
  const reco = latestOf(messages, (m) => m.sender === "copilot");
  if (!reco) return true;
  return orderOf(theirs) > orderOf(reco);
}

/**
 * Ordering key. `created_at` alone ties on the common case of a sync writing a message
 * and a recommendation landing in the same second, so the row id breaks the tie — it is
 * monotonic and is what the thread is displayed in.
 */
function orderOf(message: Message): string {
  return `${message.created_at}#${String(message.id).padStart(12, "0")}`;
}

function latestOf(messages: Message[], match: (m: Message) => boolean): Message | null {
  let best: Message | null = null;
  for (const m of messages) {
    if (!match(m)) continue;
    if (!best || orderOf(m) > orderOf(best)) best = m;
  }
  return best;
}
