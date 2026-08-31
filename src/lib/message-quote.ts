/**
 * Splits an email body into what was actually written and the chain quoted underneath it.
 *
 * A pasted or Gmail-synced reply carries the whole prior thread as ">" lines. On a real
 * follow-up here that was 26 quoted lines and 940px of wall — the four sentences someone
 * wrote buried above a copy of the email they were replying to, which the reader already
 * knows because it is the message directly above it in the same thread.
 *
 * Every mail client folds this away. Nothing here did.
 */
export interface SplitMessage {
  /** What this person actually wrote. Never empty — see the quote-only case. */
  latest: string;
  /** The quoted chain, including its "On … wrote:" attribution, or null. */
  quoted: string | null;
  /** Lines in the quoted chain, for a control that says how much is hidden. */
  quotedLines: number;
}

/** "On Mon, Aug 24, 2026 at 12:14 PM Thomas Ryoko <thomas@example.com> wrote:" */
const ATTRIBUTION = /^\s*(on\b.*\bwrote:|-{2,}\s*original message\s*-{2,}|from:\s.+)\s*$/i;

export function splitQuotedReply(body: string): SplitMessage {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let start = lines.findIndex((line) => line.trimStart().startsWith(">"));
  if (start === -1) return { latest: body.trim(), quoted: null, quotedLines: 0 };

  // The attribution belongs to the quote, not to the message. It may sit directly above
  // the first ">" line or be separated from it by a blank line.
  for (let i = start - 1; i >= start - 2 && i >= 0; i--) {
    if (lines[i].trim() === "") continue;
    if (ATTRIBUTION.test(lines[i])) start = i;
    break;
  }

  const latest = lines.slice(0, start).join("\n").trim();
  const quoted = lines.slice(start).join("\n").trim();

  // A forward with no new text of its own: hiding the quote would hide the message.
  if (!latest) return { latest: quoted, quoted: null, quotedLines: 0 };

  return { latest, quoted, quotedLines: quoted.split("\n").length };
}
