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

const PLATFORM_ALIAS: Record<string, string> = {
  youtube: "youtube|yt",
  instagram: "instagram|insta(?:gram)?|ig",
  tiktok: "tiktok|tik[ -]?tok",
  facebook: "facebook|fb",
};

/** Regex source for a platform name and the abbreviations managers commonly type. */
export function platformAliasPattern(platform: string): string {
  return PLATFORM_ALIAS[platform.toLowerCase()] ?? platform.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Counts only deliverables explicitly attached to a platform.
 *
 * "1 YouTube integration + 2 IG reels" becomes {youtube: 1, instagram: 2}. An
 * unqualified "1 story" is intentionally not guessed onto Instagram: an omitted piece
 * is visible and fixable, while attributing it to the wrong channel corrupts pricing.
 */
export function deliverableCountsByPlatform(
  text: string | null | undefined,
  platforms: string[]
): Record<string, number> {
  const result: Record<string, number> = {};
  const chunks = (text ?? "")
    .split(/\s*(?:\+|,|;|\b(?:and|plus)\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const platform = platforms.find((candidate) =>
      new RegExp(`\\b(?:${platformAliasPattern(candidate)})\\b`, "i").test(chunk)
    );
    if (!platform) continue;
    const count = Number(chunk.match(/(?:^|\s)(\d+)\s*(?:×|x)?/i)?.[1] ?? 1);
    if (!Number.isFinite(count) || count <= 0) continue;
    result[platform] = (result[platform] ?? 0) + count;
  }
  return result;
}

export interface ProvisionalDeliverable {
  title: string;
  platform: string;
}

/**
 * Turns the manager's scope line into a safe provisional work plan.
 *
 * This deliberately returns nothing when a mixed-platform scope is ambiguous. An empty
 * plan creates a visible setup exception; a guessed plan creates the wrong obligations.
 * The signed contract remains the source of truth and replaces these provisional rows.
 */
export function provisionalDeliverables(
  text: string | null | undefined,
  platforms: string[]
): { items: ProvisionalDeliverable[]; reason: string | null } {
  const scope = text?.trim();
  if (!scope) return { items: [], reason: "Add the deliverables before creating the content plan." };
  if (platforms.length === 0) return { items: [], reason: "Choose a platform first." };
  if (platforms.length > 1 && isCrosspostText(scope)) {
    return {
      items: [],
      reason: "Cross-posted scope needs a manager to confirm which platform URLs are tracked separately.",
    };
  }

  const chunks = scope
    .split(/\s*(?:\+|,|;|\b(?:and|plus)\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (chunks.length === 0) return { items: [], reason: "Add the deliverables first." };

  const planned: ProvisionalDeliverable[] = [];
  for (const chunk of chunks) {
    const platform =
      platforms.find((candidate) =>
        new RegExp(`\\b(?:${platformAliasPattern(candidate)})\\b`, "i").test(chunk)
      ) ?? (platforms.length === 1 ? platforms[0] : null);
    if (!platform) {
      return {
        items: [],
        reason: `Name a platform for “${chunk}” before creating the mixed-platform content plan.`,
      };
    }

    const quantity = Math.max(
      1,
      Math.round(Number(chunk.match(/(?:^|\s)(\d+)\s*(?:×|x)?/i)?.[1] ?? 1))
    );
    const label = chunk.replace(/^\s*\d+\s*(?:×|x)?\s*/i, "").trim() || "Content item";
    for (let index = 0; index < quantity; index += 1) {
      planned.push({
        title: quantity > 1 ? `${label} (${index + 1}/${quantity})` : label,
        platform,
      });
    }
  }

  return { items: planned, reason: null };
}

/**
 * True when the deliverables describe one production distributed to several platforms.
 *
 * Lives here rather than beside the prompt that first needed it because pricing needs the
 * same answer: a crosspost sums reach but is only paid for once, so the two must agree or
 * the number shown and the number charged describe different deals.
 */
export function isCrosspostText(text: string | null | undefined): boolean {
  return /cross.?post|same\s+(?:video|content|short)|repost/i.test(text ?? "");
}

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
