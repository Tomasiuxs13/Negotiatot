import { describe, it, expect } from "vitest";
import { awaitingPostEmail, chaseDraftEmail, onboardingEmail } from "../nudge-email";

const TODAY = "2026-08-03";

describe("chaseDraftEmail", () => {
  const base = {
    creator: "Coastal Cruiser",
    itemTitle: "Holiday Reel (1/2)",
    today: TODAY,
    leadDays: 10,
    senderName: "Tomas",
  };

  it("asks for a date when none was agreed, instead of inventing urgency", () => {
    const text = chaseDraftEmail({ ...base, publishDate: null });
    expect(text).toContain("what publish date you're aiming for");
    expect(text).not.toContain("overdue");
  });

  it("is a friendly heads-up before the draft deadline", () => {
    const text = chaseDraftEmail({ ...base, publishDate: "2026-09-20" });
    expect(text).toContain("draft is due by 10 September");
    expect(text).not.toContain("nudge on");
  });

  it("burns the buffer plainly once the draft deadline has passed", () => {
    // Publishes in 9 days, draft was due yesterday.
    const text = chaseDraftEmail({ ...base, publishDate: "2026-08-12" });
    expect(text).toContain("Quick nudge");
    expect(text).toContain("publishes on 12 August");
  });

  it("switches to renegotiating the date once the slot itself has passed", () => {
    const text = chaseDraftEmail({ ...base, publishDate: "2026-07-28" });
    expect(text).toContain("slipped past");
    expect(text).toContain("agree a new date");
    // Blame-free by design: no "overdue" language at the creator.
    expect(text).not.toContain("overdue");
  });

  it("renders dates as prose, not ISO stamps", () => {
    const text = chaseDraftEmail({ ...base, publishDate: "2026-09-20" });
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("includes the portal link only when there is one", () => {
    expect(
      chaseDraftEmail({ ...base, publishDate: null, portalUrl: "https://x.test/portal/abc" })
    ).toContain("https://x.test/portal/abc");
    expect(chaseDraftEmail({ ...base, publishDate: null })).not.toContain("portal");
  });

  it("falls back to a placeholder signature rather than signing as nobody", () => {
    expect(chaseDraftEmail({ ...base, senderName: undefined, publishDate: null })).toContain(
      "[your name]"
    );
  });
});

describe("awaitingPostEmail", () => {
  const base = { creator: "Sigcruiser", itemTitle: "Autumn integration", today: TODAY };

  it("asks what is holding it up when the slot has passed", () => {
    const text = awaitingPostEmail({ ...base, publishDate: "2026-07-30" });
    expect(text).toContain("don't see it live yet");
    expect(text).toContain("30 July");
  });

  it("is a simple go-ahead when the slot is still ahead", () => {
    const text = awaitingPostEmail({ ...base, publishDate: "2026-08-14" });
    expect(text).toContain("approved and good to go for 14 August");
    expect(text).not.toContain("holding it up");
  });

  it("still works with no date at all", () => {
    const text = awaitingPostEmail({ ...base, publishDate: null });
    expect(text).toContain("approved and good to go");
  });
});

describe("onboardingEmail", () => {
  const base = { creator: "Ridgeline Ruth", senderName: "Tomas" };

  it("includes only the setup that actually exists — no blank placeholders", () => {
    const text = onboardingEmail({ ...base, trackingLink: "https://t.test/ruth" });
    expect(text).toContain("https://t.test/ruth");
    // A coupon that hasn't been issued must be absent, not rendered as a blank.
    expect(text).not.toContain("code for viewers");
  });

  it("carries the portal link with an explanation of what it is for", () => {
    const text = onboardingEmail({ ...base, portalUrl: "https://x.test/portal/abc" });
    expect(text).toContain("https://x.test/portal/abc");
    expect(text).toContain("Submit drafts");
  });

  it("mentions the brand when configured and stays generic when not", () => {
    expect(onboardingEmail({ ...base, brandName: "Ryoko" })).toContain("with Ryoko");
    expect(onboardingEmail(base)).toContain("Great to have you on board —");
  });
});
