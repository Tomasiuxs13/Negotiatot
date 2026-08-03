/**
 * How far a creator's setup has got.
 *
 * Onboarding lives at the partner level by design — the affiliate link and the account
 * are issued once per creator and carry across every future deal — so "is this creator
 * ready" is a partners question, not a per-deal one. This is the reading of it.
 *
 * Pure: no database import, so it can be tested and shared.
 */

import type { OnboardingKind, OnboardingTask } from "./fulfillment-types";
import { BLOCKING_KINDS } from "./fulfillment-types";

export interface SetupProgress {
  done: number;
  total: number;
  /** Unfinished steps that other work depends on — without these nothing is measurable. */
  blockingLeft: OnboardingKind[];
}

/** Null when the creator has no checklist yet: nothing has been promised, so nothing is late. */
export function setupProgress(
  tasks: Pick<OnboardingTask, "status" | "kind" | "partner_id">[],
  partnerId: number
): SetupProgress | null {
  const mine = tasks.filter((t) => t.partner_id === partnerId);
  if (mine.length === 0) return null;
  const left = mine.filter((t) => t.status !== "done");
  return {
    done: mine.length - left.length,
    total: mine.length,
    blockingLeft: left.filter((t) => BLOCKING_KINDS.includes(t.kind)).map((t) => t.kind),
  };
}

export type SetupState = "none" | "ready" | "blocked" | "in_progress";

/**
 * `blocked` is deliberately distinct from `in_progress`: an outstanding welcome email is
 * a courtesy, an outstanding tracking link means every result this creator produces will
 * be unattributable. Collapsing them into one "incomplete" hides the only one that costs
 * money.
 */
export function setupState(progress: SetupProgress | null): SetupState {
  if (!progress) return "none";
  if (progress.done === progress.total) return "ready";
  return progress.blockingLeft.length > 0 ? "blocked" : "in_progress";
}
