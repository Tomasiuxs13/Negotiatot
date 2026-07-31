import { draftDueDate } from "./timeline";

/**
 * The change-request email, generated deterministically so it appears instantly and
 * is fully editable before the manager copies it — the system never sends anything.
 */
export function changeRequestEmail(params: {
  creator: string;
  itemTitle: string;
  publishDate: string | null;
  revisionRound: number;
  senderName?: string;
  changes?: string;
}): string {
  const { creator, itemTitle, publishDate } = params;
  const deadlineLine = publishDate
    ? `To keep the ${publishDate} publish slot, we'd need the revised draft by ${draftDueDate(publishDate, 5)}.`
    : `Send the revised draft as soon as you can so we keep the schedule.`;
  return [
    `Hi ${creator},`,
    ``,
    `Thanks for sending the draft of ${itemTitle} — we're close. A few things to adjust before it goes live:`,
    ``,
    params.changes?.trim() || `- [describe the changes needed]`,
    ``,
    deadlineLine,
    ``,
    `Everything else looks great — appreciate the quick turnaround.`,
    ``,
    `Best,`,
    params.senderName || `[your name]`,
  ].join("\n");
}
