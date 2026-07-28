/**
 * A cheap sanity check on the view figure every price is derived from.
 *
 * Views are the one input the whole valuation hangs off, and a wrong one is not obvious
 * on screen — a 445k-subscriber channel recorded at 4,900 average views produced a
 * confident $100-a-video offer, with the error visible only as prose buried in the
 * analysis summary.
 *
 * The only signal available without another API call is the ratio of views to followers.
 * It is deliberately a wide band: view rates vary enormously by niche, age of channel and
 * how much of the back catalogue is still earning. This is meant to catch data entered
 * for the wrong channel or in the wrong unit, not to second-guess a real number.
 */
export function suspectAudienceData(params: {
  avgViews: number | null | undefined;
  followers: number | null | undefined;
}): string | null {
  const { avgViews, followers } = params;
  if (!avgViews || !followers || avgViews <= 0 || followers <= 0) return null;

  const ratio = avgViews / followers;
  // 5–20% is the ordinary band. The floor sits at 2% rather than 1% because the case
  // this exists to catch — 4,900 views on a 445k channel — lands at 1.1%, and a check
  // that misses its own motivating example is decoration.
  if (ratio < 0.02) {
    return (
      `${avgViews.toLocaleString("en-US")} average views against ${followers.toLocaleString("en-US")} ` +
      `followers is about ${(ratio * 100).toFixed(1)}% — low enough that this is usually the wrong ` +
      `channel, a Shorts-diluted average, or a figure that needs re-checking before you price on it.`
    );
  }
  if (ratio > 2) {
    return (
      `${avgViews.toLocaleString("en-US")} average views against only ` +
      `${followers.toLocaleString("en-US")} followers is unusually high — worth confirming it isn't ` +
      `a single viral video rather than a typical one.`
    );
  }
  return null;
}
