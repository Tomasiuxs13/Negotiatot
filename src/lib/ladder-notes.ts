import { money } from "./format";
import { trueDealCost, type Commission, type Discount } from "./commission";

/**
 * The two things a bare price ladder doesn't say, and that managers ask about first.
 *
 * A ladder showing "$2,350 / $2,717 / $3,076" is read as a per-video rate when the deal
 * is a three-video bundle, and as the cost of the deal when commission, the audience
 * coupon and the gifted product are all still to come. On a real deal those two gaps
 * were a 3× and a 2× misreading of the same three numbers.
 */
export function ladderNotes(params: {
  /** The fee the ladder's target marker represents. */
  targetFee: number | null | undefined;
  /** How many pieces of content the fee covers. */
  pieces: number;
  /** The manager's own words for the deliverables, shown verbatim when present. */
  scopeText?: string | null;
  /** Orders expected across the whole bundle — drives commission and coupon cost. */
  expectedOrders: number;
  aov: number;
  commission?: Commission;
  discount?: Discount;
  productCost?: number;
}): { scopeNote: string | null; costNote: string | null } {
  const { targetFee, pieces, scopeText } = params;

  const perPiece =
    targetFee != null && pieces > 1 ? ` · about ${money(targetFee / pieces)} each` : "";
  const scopeNote = scopeText
    ? `Fee covers ${scopeText}${perPiece}`
    : pieces > 1
      ? `Fee covers ${pieces} pieces${perPiece}`
      : null;

  let costNote: string | null = null;
  if (targetFee != null) {
    const cost = trueDealCost({
      fee: targetFee,
      expectedOrders: params.expectedOrders,
      aov: params.aov,
      commission: params.commission,
      discount: params.discount,
      productCost: params.productCost,
    });
    // Only worth saying when the extras actually move the number; on a flat-fee deal
    // with no commission, coupon or gift, repeating the fee as "total cost" is noise.
    if (cost.total > cost.fee) {
      costNote = `Total cost about ${money(cost.total)} with commission and product`;
    }
  }

  return { scopeNote, costNote };
}

export interface CostScopeLine {
  /** What the money buys, ready to render — "for 3 IG reels · fee about $82 each". */
  text: string;
  /** True when no deliverables were ever written down and the count is a fallback. */
  assumed: boolean;
}

/**
 * What a deal's cost is buying, said next to the cost.
 *
 * A total with no scope beside it is not merely thin, it is misleading: the fee is a
 * whole-bundle figure, so the same "$402" describes one video or three. Worse, most
 * deals carry no deliverables text at all and are priced on the Playbook's
 * minIntegrations instead — the analysis records that as "Deliverables: Unspecified,
 * priced as 2 integrations" and the screen used to show only the number that came out
 * of it. `assumed` exists so the two cases never render alike: a count nobody chose has
 * to look different from a scope the manager wrote.
 */
export function costScopeLine(params: {
  /** The manager's own words for the deliverables, shown verbatim when present. */
  scopeText?: string | null;
  /** Pieces the fee actually covers — written scope if parsed, else Playbook fallback. */
  pieces: number;
  /** The fee the total is built on, used only for the per-piece figure. */
  fee?: number | null;
}): CostScopeLine {
  const scope = params.scopeText?.trim();
  const pieces = Math.max(1, Math.round(params.pieces) || 1);
  const what = scope || `${pieces} ${pieces === 1 ? "piece" : "pieces"} of content`;
  // Per-piece is the number a manager quotes, so it is the FEE split, never the total:
  // dividing a total that already contains commission and product would overstate the
  // rate being offered for one video.
  const fee = params.fee;
  const each =
    fee != null && fee > 0 && pieces > 1 ? ` · fee about ${money(fee / pieces)} each` : "";
  return { text: `for ${what}${each}`, assumed: !scope };
}
