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
