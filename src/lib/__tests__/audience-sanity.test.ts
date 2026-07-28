import { describe, expect, it } from "vitest";
import { suspectAudienceData } from "../audience-sanity";

describe("suspectAudienceData", () => {
  it("flags the Gary Bembridge case", () => {
    // 4,900 views against 445k followers is ~1.1% — the figure that produced a
    // $100-a-video offer for a 445k-subscriber channel.
    const msg = suspectAudienceData({ avgViews: 4900, followers: 445000 });
    expect(msg).toContain("4,900");
    expect(msg).toContain("445,000");
  });

  it("accepts an ordinary view rate", () => {
    // 79k against 445k is ~18%, a healthy long-form rate.
    expect(suspectAudienceData({ avgViews: 79000, followers: 445000 })).toBeNull();
  });

  it("leaves small channels alone when the ratio is sane", () => {
    // Sigcruiser: tiny, but 923 of 5,000 is a strong 18% — small is not suspect.
    expect(suspectAudienceData({ avgViews: 923, followers: 5000 })).toBeNull();
  });

  it("flags views far above the follower count", () => {
    const msg = suspectAudienceData({ avgViews: 500000, followers: 10000 });
    expect(msg).toContain("unusually high");
  });

  it("says nothing without a follower count to compare against", () => {
    // The common case today — followers is rarely captured, and a guess would be worse
    // than silence.
    expect(suspectAudienceData({ avgViews: 4900, followers: null })).toBeNull();
    expect(suspectAudienceData({ avgViews: null, followers: 445000 })).toBeNull();
    expect(suspectAudienceData({ avgViews: 0, followers: 0 })).toBeNull();
  });
});
