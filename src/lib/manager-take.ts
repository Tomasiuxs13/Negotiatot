import { deliverableCount } from "./deliverables";
import { money } from "./format";

/**
 * The manager's own instruction for a recommendation — "offer $200 per video for 3
 * videos" — as opposed to the deal notes, which are deliberately context and never
 * instructions.
 *
 * Two jobs here. Carry the instruction into the prompt, and catch before the call the one
 * mistake it invites: a take that names a price the guardrails will refuse. The model
 * would produce a draft, the guard would reject it, and the manager would see a failed
 * job rather than the reason. Cheaper and kinder to say it in the box.
 */

export const MAX_TAKE_LENGTH = 600;

export function normalizeTake(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const take = raw.trim().replace(/\s+\n/g, "\n");
  if (!take) return null;
  return take.slice(0, MAX_TAKE_LENGTH);
}

export interface TakeAmount {
  /** What the manager is proposing to pay in total, in dollars. */
  total: number;
  /** Present when they priced per piece — "$200 per video". */
  perUnit?: number;
  /** How many pieces the take covers, when it says. */
  units?: number;
}

const PIECE = "(?:videos?|posts?|reels?|shorts?|integrations?|pieces?|deliverables?)";
const NUMBER = "\\$?\\s*([\\d][\\d,]*(?:\\.\\d+)?)\\s*(?:\\$|usd|dollars?)?";

function toNumber(raw: string): number | null {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Reads the money out of a take, for the common ways a manager writes one. Returns null
 * when it cannot tell — an unparsed take is not a wrong take, so nothing is warned about.
 */
export function parseTakeAmount(text: string): TakeAmount | null {
  const source = text.toLowerCase();

  // "$200 per video", "200$ each", "200 a video" — and "each" on its own, because
  // "$250 each for 2 reels" puts the count after the word, not before it.
  const perUnitMatch = new RegExp(
    `${NUMBER}\\s*(?:(?:per|/|a)\\s*${PIECE}|each\\b(?:\\s*${PIECE})?)`,
    "i"
  ).exec(source);
  // "for 3 videos", "3x video", "3 videos"
  const unitsMatch = new RegExp(`(\\d{1,2})\\s*(?:x\\s*)?${PIECE}`, "i").exec(source);

  if (perUnitMatch) {
    const perUnit = toNumber(perUnitMatch[1]);
    if (perUnit != null) {
      const units = unitsMatch ? Number(unitsMatch[1]) : null;
      if (units && units > 0) return { total: perUnit * units, perUnit, units };
      return { total: perUnit, perUnit, units: 1 };
    }
  }

  // A plain amount: the first money-shaped number that is not a count of pieces.
  const plain = new RegExp(`${NUMBER}`, "i").exec(source);
  if (plain) {
    const total = toNumber(plain[1]);
    // "3 videos" alone is a scope, not a price.
    const isPieceCount = new RegExp(`${NUMBER}\\s*(?:x\\s*)?${PIECE}`, "i").test(source);
    if (total != null && !(isPieceCount && total <= 20)) {
      return { total, ...(unitsMatch ? { units: Number(unitsMatch[1]) } : {}) };
    }
  }
  return null;
}

/**
 * What to tell the manager before the call, if anything.
 *
 * The ceiling is the lower of walk-away and breakeven — the same rule the recommendation
 * guard enforces — and the usual reason a sensible take breaches it is that the take
 * covers more pieces than the deal was priced for. That is worth saying, because the fix
 * is not a smaller number, it is updating the deliverables and re-running the analysis.
 */
export function takeGuardWarning(input: {
  take: string;
  walkaway: number | null;
  breakeven: number | null;
  deliverables: string | null;
  platforms: string[];
  /** The Playbook's floor: below it a fee is not worth the paperwork. */
  minPaidFee?: number | null;
}): string | null {
  const amount = parseTakeAmount(input.take);
  if (!amount) return null;

  // The floor, which is invisible on the deal page and catches people out the other way:
  // a small fee is not a small win, it is a contract, an invoice and a payment run for
  // less than they cost. The Copilot will structure it as no-fee instead, so say so now.
  const floor = input.minPaidFee ?? null;
  if (floor != null && floor > 0 && amount.total > 0 && amount.total < floor) {
    return `Your take comes to ${money(amount.total)}, below the ${money(floor)} minimum paid fee in your Playbook. The Copilot will not draft a fee under it — it will offer a product and performance structure instead. Raise the number, or lower the minimum in the Playbook.`;
  }

  const ceilings = [input.walkaway, input.breakeven].filter(
    (value): value is number => value != null
  );
  if (ceilings.length === 0) return null;
  const ceiling = Math.min(...ceilings);
  if (amount.total <= ceiling) return null;

  const pricedFor = input.deliverables
    ? deliverableCount({ text: input.deliverables, platforms: input.platforms as never[] })
    : 1;
  const scopeMismatch = amount.units != null && amount.units > pricedFor;

  const head = `Your take comes to ${money(amount.total)}${
    amount.perUnit != null && amount.units != null && amount.units > 1
      ? ` (${money(amount.perUnit)} × ${amount.units})`
      : ""
  }, above this deal's ceiling of ${money(ceiling)}.`;

  return scopeMismatch
    ? `${head} That ceiling was computed for ${pricedFor} deliverable${pricedFor === 1 ? "" : "s"}, and your take covers ${amount.units}. Update the deliverables on the deal and re-run the analysis so the numbers cover the whole bundle — then this take fits.`
    : `${head} The Copilot will not draft above it. Lower the number, or change what the deal covers and re-run the analysis.`;
}
