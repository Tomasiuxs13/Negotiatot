/**
 * The shape of a stats report once the cheap extraction pass has read it, plus the two
 * pure decisions made about it: whether it can be trusted, and how it reads in a prompt.
 *
 * Separate from claude.ts because that module is server-only and these are the parts
 * worth testing — the guard is the safety mechanism for the whole two-pass design.
 */

export interface ExtractedReport {
  avgViews: number | null;
  avgViewsBasis: string | null;
  engagementRatePct: number | null;
  followers: number | null;
  audienceGeoTopShares: { country: string; sharePct: number }[];
  fakeFollowerPct: number | null;
  viewsTrendPct: number | null;
  viewsTrendBasis: string | null;
  rateCardFigures: string[];
  channelUrl: string | null;
  notableSignals: string[];
  missingFields: string[];
}

/**
 * Whether an extraction is trustworthy enough to analyse from instead of the document.
 *
 * Deliberately conservative. The failure this guards against is not a crash — it is Opus
 * grading confidently against numbers that were never in the report, producing an
 * analysis that looks exactly as authoritative as a correct one. When in doubt we pay
 * full price and send the raw document, because the wrong answer costs far more than
 * the tokens saved.
 */
export function isExtractionUsable(e: ExtractedReport | null): e is ExtractedReport {
  if (!e) return false;
  // Views are what every number downstream is computed from; without them there is
  // nothing to analyse and the document has to go through whole.
  if (e.avgViews == null && e.followers == null && e.engagementRatePct == null) return false;
  if (e.avgViews != null && (e.avgViews <= 0 || e.avgViews > 1_000_000_000)) return false;
  if (e.engagementRatePct != null && (e.engagementRatePct < 0 || e.engagementRatePct > 100)) return false;
  if (e.fakeFollowerPct != null && (e.fakeFollowerPct < 0 || e.fakeFollowerPct > 100)) return false;
  if (e.followers != null && (e.followers <= 0 || e.followers > 10_000_000_000)) return false;
  // A creator with more average views than followers happens (Shorts, virality), but
  // two orders of magnitude apart means a misread — a decimal point or a K/M suffix.
  if (e.avgViews != null && e.followers != null && e.avgViews > e.followers * 100) return false;
  return true;
}

/** The extraction as prose for the analysis prompt, with absences stated as absences. */
export function describeExtraction(e: ExtractedReport): string {
  const lines: string[] = ["## Creator report (extracted from the uploaded document)"];
  const num = (n: number | null) => (n == null ? null : n.toLocaleString("en-US"));

  if (e.avgViews != null)
    lines.push(`- Avg views: ${num(e.avgViews)}${e.avgViewsBasis ? ` (${e.avgViewsBasis})` : ""}`);
  if (e.followers != null) lines.push(`- Followers: ${num(e.followers)}`);
  if (e.engagementRatePct != null) lines.push(`- Engagement rate: ${e.engagementRatePct}%`);
  if (e.audienceGeoTopShares.length > 0)
    lines.push(
      `- Audience geo: ${e.audienceGeoTopShares.map((g) => `${g.country} ${g.sharePct}%`).join(", ")}`
    );
  if (e.fakeFollowerPct != null) lines.push(`- Fake followers: ${e.fakeFollowerPct}%`);
  if (e.viewsTrendPct != null)
    lines.push(
      // Always qualified. A real report offered "233.08%" that was yearly follower
      // growth; unqualified it reads as views rocketing, which is the opposite kind of
      // fact and would have been graded as a strength.
      `- Views/likes trend: ${e.viewsTrendPct}%${e.viewsTrendBasis ? ` (${e.viewsTrendBasis})` : " — basis not stated, treat with caution"}`
    );
  if (e.rateCardFigures.length > 0) lines.push(`- Stated rates: ${e.rateCardFigures.join(" · ")}`);
  if (e.notableSignals.length > 0) {
    lines.push(`- Other signals from the report:`);
    for (const s of e.notableSignals) lines.push(`  - ${s}`);
  }
  if (e.missingFields.length > 0) {
    lines.push(
      `- NOT in the report (treat as unknown, never as zero): ${e.missingFields.join(", ")}`
    );
  }
  return lines.join("\n");
}
