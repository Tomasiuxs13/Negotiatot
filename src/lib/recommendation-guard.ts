/** The fixed-fee ceiling is whichever manager constraint is tighter. */
export function fixedFeeCeiling(input: {
  walkaway: number | null | undefined;
  breakeven: number | null | undefined;
}): number | null {
  const candidates = [input.walkaway, input.breakeven].filter(
    (value): value is number => value != null && Number.isFinite(value) && value >= 0
  );
  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export function recommendationGuardError(input: {
  proposedOffer: number;
  walkaway: number | null | undefined;
  breakeven: number | null | undefined;
}): string | null {
  if (!Number.isFinite(input.proposedOffer) || input.proposedOffer < 0) {
    return "The recommendation produced an invalid offer.";
  }
  const ceiling = fixedFeeCeiling(input);
  if (ceiling != null && input.proposedOffer > ceiling) {
    return `The proposed $${Math.round(input.proposedOffer)} fixed fee exceeds the $${Math.round(ceiling)} profitability ceiling.`;
  }
  return null;
}

export interface EvidenceAssessment {
  evidenceConfidence?: "confirmed" | "mixed" | "insufficient";
  evidenceNotes?: string;
  redFlags?: { title: string; detail: string; severity: "good" | "warn" | "crit" }[];
}

/**
 * Returns the reason quantitative claims are unsafe, or null when platform evidence is
 * confirmed. The structured field covers new analyses; the red-flag fallback keeps old
 * stored analyses safe without a migration.
 */
export function quantitativeEvidenceRisk(
  analysis: EvidenceAssessment | null | undefined,
  options: {
    /**
     * The manager has set the audience figures by hand and stands behind them.
     *
     * Every projection in a draft is built from average views, and a figure the manager
     * entered is the most authoritative source this app has — more so than a number a
     * model read off an unlabelled block in a PDF. The guard exists to stop the COPILOT
     * projecting from evidence nobody vouched for; once someone has vouched, it has done
     * its job. The lock is recorded on the deal either way, so the basis is auditable.
     */
    managerConfirmedAudience?: boolean;
  } = {}
): string | null {
  if (options.managerConfirmedAudience) return null;
  if (!analysis) return "No completed analysis confirms the platform evidence.";
  if (analysis.evidenceConfidence && analysis.evidenceConfidence !== "confirmed") {
    return analysis.evidenceNotes?.trim() ||
      `The analysis marked the evidence ${analysis.evidenceConfidence}.`;
  }
  if (analysis.evidenceConfidence === "confirmed") return null;

  const source = /report|analytics|data|source|platform|channel|reach|views|audience/i;
  const risk = /mismatch|missing|unknown|unverified|self[- ]reported|not provided|no .{0,20}data|different|priced as|does not match|cannot confirm|can't confirm/i;
  const flag = analysis.redFlags?.find((item) => {
    if (item.severity === "good") return false;
    const text = `${item.title} ${item.detail}`;
    return source.test(text) && risk.test(text);
  });
  return flag ? `${flag.title}: ${flag.detail}` : null;
}

/**
 * A fixed fee or per-sale commission rate is a term; projected orders or a total payout
 * is a promise. Block only the latter when the evidence behind the forecast is unsafe.
 */
export function recommendationProjectionGuardError(input: {
  draft: string;
  evidenceRisk: string | null;
}): string | null {
  if (!input.evidenceRisk) return null;
  const projection = [
    /\b\d+(?:\.\d+)?\s+(?:orders?|sales?|purchases?|conversions?|views?)\b/i,
    /\$\s?[\d,.]+\s+(?:in\s+)?(?:commission|earn(?:ing|ings)?|revenue|return)\b/i,
    /\b(?:expect|forecast|project|roughly|about|around)\b[^.!?\n]{0,100}\b(?:orders?|sales?|purchases?|conversions?|commission|earn(?:ing|ings)?|revenue|views?|reach|ROI|ROAS)\b/i,
    /\b(?:could|should)\s+(?:drive|generate|deliver|reach|earn)\b[^.!?\n]{0,80}(?:\$|\d)/i,
  ].find((pattern) => pattern.test(input.draft));
  if (!projection) return null;
  // The remedy belongs in the error. Without it this reads as a dead end, when the fix is
  // usually ten seconds of work: confirm the views you already trust.
  return (
    `The draft contains a quantitative performance promise, but its platform evidence is not confirmed: ${input.evidenceRisk}` +
    ` — if you stand behind the audience figures, set them with "Correct this" on the deal and run this again; the projection is then allowed.`
  );
}

/** Final status for every successful recommendation, including non-opening rounds. */
export function recommendationReadyLabel(round: number, isOpening: boolean): string {
  return isOpening ? "Opening offer ready" : `Round ${Math.max(round, 1)} · Recommendation ready`;
}
