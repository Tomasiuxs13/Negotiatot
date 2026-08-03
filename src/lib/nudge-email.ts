/**
 * The chase emails — the most frequent messages an influencer manager writes, generated
 * so they never start from a blank page. Deterministic, like the change-request email:
 * no model call, instant, fully editable, never sent by the system.
 *
 * Every journey that says "check in with the creator" ends on one of these. The wording
 * adapts to what is actually true — a draft that is merely coming due gets a nudge, an
 * overdue one gets a deadline, an approved video gets "when is it going live" — because a
 * chase that misstates the situation reads as automated and gets ignored.
 */

import { draftDueDate, daysToPublish } from "./timeline";

/** "3 September" — dates inside an email should read as prose, not as ISO stamps. */
function prose(date: string): string {
  const d = new Date(date.slice(0, 10) + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

function signoff(senderName?: string): string[] {
  return [``, `Best,`, senderName || `[your name]`];
}

function portalLine(portalUrl?: string | null): string[] {
  return portalUrl
    ? [``, `You can drop the link straight into your portal: ${portalUrl}`]
    : [];
}

/**
 * "Where's the draft?" — sent while an item is planned or in production.
 *
 * Overdue and not-yet-due are different messages, not different adjectives: before the
 * deadline this is a friendly heads-up that protects the review buffer; after it, the
 * publish slot itself is at risk and the email must say so plainly.
 */
export function chaseDraftEmail(params: {
  creator: string;
  itemTitle: string;
  /** The agreed publish date; null when none was set. */
  publishDate: string | null;
  today: string;
  leadDays: number;
  senderName?: string;
  portalUrl?: string | null;
}): string {
  const { creator, itemTitle, publishDate, today, leadDays } = params;

  let body: string[];
  if (!publishDate) {
    body = [
      `Quick check-in on ${itemTitle} — how is it coming along?`,
      ``,
      `Could you send over the draft when you have it, and let me know what publish date you're aiming for? Once we have a date I can keep everything on our side lined up behind it.`,
    ];
  } else {
    const draftDue = draftDueDate(publishDate, leadDays);
    const daysLeft = daysToPublish(publishDate, today);
    if (daysLeft < 0) {
      // The slot has passed entirely.
      body = [
        `Checking in on ${itemTitle} — the ${prose(publishDate)} publish date has slipped past and I haven't seen a draft yet.`,
        ``,
        `Can you let me know where it stands and when you can get it over? If something's come up, no problem — let's just agree a new date that works.`,
      ];
    } else if (draftDue <= today) {
      // Draft deadline reached or passed, slot still ahead — the buffer is burning.
      body = [
        `Quick nudge on ${itemTitle} — it publishes on ${prose(publishDate)}, so I'd need the draft ${
          daysLeft <= leadDays / 2 ? `as soon as you can` : `by ${prose(draftDue)}`
        } to leave room for review and any tweaks.`,
        ``,
        `Anything you need from me to get it over the line?`,
      ];
    } else {
      // Early nudge, nothing wrong yet.
      body = [
        `Looking ahead to ${itemTitle} publishing on ${prose(publishDate)} — just flagging that the draft is due by ${prose(draftDue)} so we have comfortable review time.`,
        ``,
        `Shout if any questions come up in the meantime.`,
      ];
    }
  }

  return [`Hi ${creator},`, ``, ...body, ...portalLine(params.portalUrl), ...signoff(params.senderName)].join("\n");
}

/** Approved but not live: the only open question is when it goes up. */
export function awaitingPostEmail(params: {
  creator: string;
  itemTitle: string;
  publishDate: string | null;
  today: string;
  senderName?: string;
  portalUrl?: string | null;
}): string {
  const { creator, itemTitle, publishDate, today } = params;
  const overdue = publishDate != null && daysToPublish(publishDate, today) < 0;
  const body = overdue
    ? [
        `${itemTitle} is approved and ready, but I don't see it live yet — the agreed slot was ${prose(publishDate!)}.`,
        ``,
        `Is anything holding it up? Once it's posted, send me the link so I can start tracking results.`,
      ]
    : [
        `${itemTitle} is approved and good to go${publishDate ? ` for ${prose(publishDate)}` : ""}.`,
        ``,
        `Once it's live, send me the link so I can start tracking results from day one.`,
      ];
  return [`Hi ${creator},`, ``, ...body, ...portalLine(params.portalUrl), ...signoff(params.senderName)].join("\n");
}

/**
 * The welcome email behind the "Send onboarding email and program brief" checklist step.
 *
 * Includes only what actually exists: a tracking link or coupon code that hasn't been
 * issued yet is left out rather than rendered as a blank, because "your code: ____" makes
 * the whole email look broken and unsendable.
 */
export function onboardingEmail(params: {
  creator: string;
  brandName?: string;
  trackingLink?: string | null;
  couponCode?: string | null;
  portalUrl?: string | null;
  senderName?: string;
}): string {
  const { creator, brandName, trackingLink, couponCode, portalUrl } = params;
  const lines: string[] = [
    `Hi ${creator},`,
    ``,
    `Great to have you on board${brandName ? ` with ${brandName}` : ""} — here's everything you need to get started.`,
  ];

  const setup: string[] = [];
  if (trackingLink) setup.push(`- Your tracking link: ${trackingLink} — use this in your description so every order is credited to you.`);
  if (couponCode) setup.push(`- Your code for viewers: ${couponCode}`);
  if (portalUrl)
    setup.push(
      `- Your portal: ${portalUrl} — your deliverables, dates, delivery status and payments, all in one place. Submit drafts and live links there.`
    );
  if (setup.length > 0) lines.push(``, ...setup);

  lines.push(
    ``,
    `The campaign brief is attached — it covers what needs to be mentioned and any wording to avoid. Give it a read before filming and flag anything that doesn't fit your style; better to adjust the plan than the finished video.`,
    ``,
    `Any questions at all, just reply here.`
  );

  return [...lines, ...signoff(params.senderName)].join("\n");
}
