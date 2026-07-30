/**
 * How many pieces of content a deal covers.
 *
 * This drives every per-bundle figure quoted to a creator, so getting it wrong quietly
 * misprices the offer: quoting one video's expected earnings against a three-video ask
 * understates by 3×, and quoting three against one overpromises by the same factor.
 */

/**
 * Counts like "3 YouTube integrations" or "2x Reels + 1 story". Deliberately narrow —
 * it matches a number attached to a known content noun, so stray numbers in free text
 * ("$500 for the bundle") are not mistaken for a piece count.
 */
// Plurals mostly fall out for free (there's no trailing word boundary, so "videos"
// matches on "video"), but "stories" doesn't share a stem with "story" and has to be
// spelled out.
const PIECE_PATTERN =
  /(\d+)\s*(?:×|x)?\s*(?:youtube|instagram|tiktok|facebook|video|integration|short|reel|stor(?:y|ies)|post)/gi;

export function deliverableCount(params: {
  /** The deal's deliverables or format text, if the manager wrote one. */
  text?: string | null;
  /** Platforms this deal covers, used to look up the Playbook fallback. */
  platforms?: string[];
  rulesByPlatform?: Record<string, Record<string, unknown> | null>;
}): number {
  const counts = [...(params.text ?? "").matchAll(PIECE_PATTERN)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (counts.length > 0) return counts.reduce((a, b) => a + b, 0);

  // Most deals carry no deliverables text at all: the manager opens the negotiation and
  // the bundle comes from the Playbook's `minIntegrations`, which is also what the draft
  // will propose. Falling back to it keeps the forecast describing the same deal the
  // creator is being offered.
  const rules = params.rulesByPlatform;
  if (rules) {
    const perPlatform = (params.platforms ?? [])
      .map((p) => Number(rules[p]?.minIntegrations ?? 0))
      .filter((n) => Number.isFinite(n) && n > 0);
    // One platform: its minimum is the bundle. Several platforms with nothing written
    // down is ambiguous — it may be separate content per platform, or one piece
    // crossposted everywhere. Summing the minimums priced a single crossposted Short
    // as six productions, so take the largest single-platform minimum instead: right
    // for a crosspost, merely conservative for a true multi-platform bundle.
    if (perPlatform.length === 1) return perPlatform[0];
    if (perPlatform.length > 1) return Math.max(...perPlatform);
  }
  return 1;
}
