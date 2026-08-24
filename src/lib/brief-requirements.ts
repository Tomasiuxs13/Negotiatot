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

export interface CheckFinding {
  id: string;
  status: "met" | "missed" | "unclear";
  evidence: string | null;
  atSeconds: number | null;
  note: string | null;
}

export interface IntegrationCheck {
  integrationStartSeconds: number | null;
  integrationEndSeconds: number | null;
  findings: CheckFinding[];
  summary: string;
}

export function parseCheck(json: string | null | undefined): IntegrationCheck | null {
  if (!json) return null;
  try {
    const c = JSON.parse(json) as IntegrationCheck;
    return Array.isArray(c.findings) ? c : null;
  } catch {
    return null;
  }
}

/** Measured length of the sponsored segment, or null when none was identified. */
export function integrationSeconds(check: IntegrationCheck): number | null {
  const { integrationStartSeconds: a, integrationEndSeconds: b } = check;
  return a != null && b != null && b > a ? b - a : null;
}

/** A successful machine check is necessary evidence before a manager can verify. */
export function verificationBlocker(
  check: IntegrationCheck | null,
  requirements: BriefRequirement[],
  minIntegrationSeconds: number | null
): string | null {
  if (requirements.length === 0 && minIntegrationSeconds == null) return null;
  if (!check) return "Run the brief check before marking this content verified.";

  const relevant = new Map(check.findings.map((finding) => [finding.id, finding.status]));
  const unresolved = requirements.filter((requirement) => relevant.get(requirement.id) !== "met");
  if (unresolved.length > 0) {
    return `${unresolved.length} brief requirement${unresolved.length === 1 ? " is" : "s are"} missed or unclear.`;
  }

  if (minIntegrationSeconds != null) {
    const measured = integrationSeconds(check);
    if (measured == null) return "The integration length was not confirmed by the check.";
    if (measured < minIntegrationSeconds) {
      return `The integration is ${formatDuration(measured)}; the brief requires ${formatDuration(minIntegrationSeconds)}.`;
    }
  }
  return null;
}

/**
 * What would go in a change-request email — the misses only.
 *
 * `unclear` is deliberately excluded. It means the transcript could not settle the
 * question, which is a reason for the manager to watch that moment, not a reason to
 * tell a creator they got something wrong.
 */
export function failedFindings(
  check: IntegrationCheck,
  requirements: BriefRequirement[]
): { finding: CheckFinding; requirement: BriefRequirement }[] {
  return check.findings.flatMap((f) => {
    if (f.status !== "missed") return [];
    // Findings whose id isn't a requirement we asked about are dropped. The model
    // sometimes volunteers an extra one — a real run invented "duration-45s" — and
    // without this the email printed a raw slug at the creator and duplicated the
    // length complaint that is added deterministically below.
    const requirement = requirements.find((r) => r.id === f.id);
    return requirement ? [{ finding: f, requirement }] : [];
  });
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
