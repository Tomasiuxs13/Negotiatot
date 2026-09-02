import type { ContentStatus, PaymentStatus } from "./fulfillment-types";
import type { Stage } from "./types";

/**
 * One color language for every status pill in the app.
 *
 * Four vocabularies (deal stages, content statuses, payment statuses, phase chips)
 * each had their own palette, and the colors collided meaninglessly — amber meant
 * "negotiating" on one screen, "posted" on another and "ready to approve" on a third,
 * so nobody could build intuition. The scale is semantic and fixed:
 *
 *   neutral — not started / dormant
 *   active  — in progress, someone else's move
 *   action  — NEEDS YOU; amber is reserved for exactly this
 *   done    — finished, settled
 *   problem — failed, declined, overdue
 */
export type StatusTone = "neutral" | "active" | "action" | "done" | "problem";

export const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  active: "bg-sky-50 text-sky-700",
  action: "bg-amber-50 text-amber-700",
  done: "bg-emerald-50 text-emerald-700",
  problem: "bg-red-50 text-red-700",
};

/** Same scale with a border, for the larger stage pill on the deal header. */
export const TONE_CLASS_BORDERED: Record<StatusTone, string> = {
  neutral: "bg-slate-100 text-slate-600 border border-slate-200",
  active: "bg-sky-50 text-sky-700 border border-sky-200",
  action: "bg-amber-50 text-amber-700 border border-amber-200",
  done: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  problem: "bg-red-50 text-red-700 border border-red-200",
};

export const DEAL_STAGE_TONE: Record<Stage, StatusTone> = {
  lead: "neutral",
  contacted: "neutral",
  in_contact: "neutral", // they answered; nothing is waiting on the manager yet
  analyzing: "action", // labeled "To review" — it is waiting on the manager
  offer_sent: "active",
  negotiating: "active", // the your-move flag, not the stage, says when it needs you
  agreed: "done",
  active: "active", // signed and running — live work, not a finished record
  completed: "done",
  declined: "problem",
};

export const CONTENT_TONE: Record<ContentStatus, StatusTone> = {
  planned: "neutral",
  in_production: "active",
  submitted: "action", // a draft is waiting on your review
  approved: "active", // back with the creator to post
  posted: "action", // live — verify it
  verified: "done",
};

export const PAYMENT_TONE: Record<PaymentStatus, StatusTone> = {
  pending: "neutral",
  approvable: "action",
  approved: "active",
  paid: "done",
};
