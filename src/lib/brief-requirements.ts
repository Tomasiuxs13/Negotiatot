/**
 * What a brand brief obliges the creator to actually do on camera.
 *
 * Briefs arrive as prose — a PDF or an HTML page written for a human to read — and the
 * obligations inside them are the things that later decide whether a posted video is
 * acceptable: say the product name, show the discount code, disclose the partnership,
 * talk about it for at least ninety seconds. Until now those lived only in the document,
 * so verifying a video meant re-reading the brief and watching with a stopwatch.
 *
 * These are extracted once per campaign and then EDITABLE, because extraction from prose
 * is never perfect and the manager is the authority on what the brand actually wants. A
 * requirement nobody can check is worse than no requirement, so each one carries how it
 * should be judged.
 */

/** How a requirement is checked against a transcript. */
export type RequirementKind =
  /** A phrase that must be spoken — brand name, product name, a specific claim. */
  | "mention"
  /** A sponsorship disclosure, which regulators care about and brands are liable for. */
  | "disclosure"
  /** Something the creator must NOT say — competitor claims, medical claims, pricing. */
  | "prohibited";

export interface BriefRequirement {
  /** Stable across edits so a check result can point back at the requirement it judged. */
  id: string;
  kind: RequirementKind;
  /** What the brief asks for, in the manager's words. */
  label: string;
  /**
   * Spoken forms that satisfy it. Transcription mangles brand names — "Ryoko" comes back
   * as "Rioko" or "Rocco" — so the check is fuzzy, but listing the real variants a
   * creator might reasonably say ("Ryoko Pro", "the Ryoko") makes it much less guesswork.
   */
  phrases: string[];
}

export interface BriefRequirements {
  /** Empty when the brief sets no explicit floor — do not invent one. */
  minIntegrationSeconds: number | null;
  requirements: BriefRequirement[];
  /** Anything the brief demands that a transcript cannot settle (on-screen logo, B-roll). */
  notCheckable: string[];
}

export const EMPTY_REQUIREMENTS: BriefRequirements = {
  minIntegrationSeconds: null,
  requirements: [],
  notCheckable: [],
};

export function parseRequirements(json: string | null | undefined): BriefRequirements {
  if (!json) return EMPTY_REQUIREMENTS;
  try {
    const parsed = JSON.parse(json) as Partial<BriefRequirements>;
    return {
      minIntegrationSeconds:
        typeof parsed.minIntegrationSeconds === "number" ? parsed.minIntegrationSeconds : null,
      requirements: Array.isArray(parsed.requirements) ? parsed.requirements : [],
      notCheckable: Array.isArray(parsed.notCheckable) ? parsed.notCheckable : [],
    };
  } catch {
    return EMPTY_REQUIREMENTS;
  }
}

/** Seconds as "1m 38s" — durations here are read against a brief's "at least 90 seconds". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

/** Seconds as "4:32", for pointing at a moment in the video. */
export function formatTimestamp(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
