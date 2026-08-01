import { draftDueDate } from "./timeline";
import {
  failedFindings,
  formatTimestamp,
  integrationSeconds,
  type BriefRequirement,
  type IntegrationCheck,
} from "./brief-requirements";

/**
 * Turns a failed integration check into the change list for a change-request email.
 *
 * Written for the creator, not the manager: each line says what was asked for and
 * where in their video the problem is, because "you didn't mention the plan" is
 * arguable and "at 4:32 you said the price without the plan" is actionable. Built
 * deterministically from the findings rather than asked of the model again — the
 * judgement already happened, and re-generating prose would let it drift from it.
 */
export function changesFromCheck(params: {
  check: IntegrationCheck;
  requirements: BriefRequirement[];
  minIntegrationSeconds: number | null;
}): string {
  const lines: string[] = [];

  for (const { finding, requirement } of failedFindings(params.check, params.requirements)) {
    const what = requirement.label;
    const where = finding.atSeconds != null ? ` (around ${formatTimestamp(finding.atSeconds)})` : "";
    // A prohibited miss means they said something they shouldn't have, so the ask is the
    // opposite of a mention miss — the wording has to flip or the note reads as nonsense.
    const isProhibited = requirement.kind === "prohibited";
    const quoted = finding.evidence ? ` — you said "${finding.evidence.trim()}"` : "";
    lines.push(
      isProhibited
        ? `- Please remove or reword: ${what}${where}${quoted}`
        : `- ${what}${where}${finding.note ? ` — ${finding.note}` : ""}`
    );
  }

  const seconds = integrationSeconds(params.check);
  if (params.minIntegrationSeconds != null && seconds != null && seconds < params.minIntegrationSeconds) {
    lines.push(
      `- The integration runs about ${Math.round(seconds)}s; the brief asks for at least ${params.minIntegrationSeconds}s. Please extend it.`
    );
  }

  return lines.join("\n");
}

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
  /**
   * True when the video is already published. The draft wording ("thanks for sending
   * the draft… before it goes live") reads as nonsense against a live video, and telling
   * a creator their published post is a draft is the kind of small wrongness that makes
   * the whole message look automated.
   */
  alreadyPosted?: boolean;
}): string {
  const { creator, itemTitle, publishDate, alreadyPosted } = params;
  const deadlineLine = alreadyPosted
    ? `Could you get these updated on the live version as soon as you can?`
    : publishDate
      ? `To keep the ${publishDate} publish slot, we'd need the revised draft by ${draftDueDate(publishDate, 5)}.`
      : `Send the revised draft as soon as you can so we keep the schedule.`;
  return [
    `Hi ${creator},`,
    ``,
    alreadyPosted
      ? `Thanks for getting ${itemTitle} live. Watching it back against the brief, a few things need adjusting:`
      : `Thanks for sending the draft of ${itemTitle} — we're close. A few things to adjust before it goes live:`,
    ``,
    params.changes?.trim() || `- [describe the changes needed]`,
    ``,
    deadlineLine,
    ``,
    alreadyPosted
      ? `Everything else looks great — thanks for turning it round.`
      : `Everything else looks great — appreciate the quick turnaround.`,
    ``,
    `Best,`,
    params.senderName || `[your name]`,
  ].join("\n");
}
