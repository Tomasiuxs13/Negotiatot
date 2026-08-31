import { describe, expect, it } from "vitest";
import { creatorSearchFields, handleAddsIdentity, handleForDeal } from "../creator-label";

describe("handleForDeal", () => {
  const channels = [
    { platform: "tiktok", handle: "mo.tt" },
    { platform: "instagram", handle: "_morgan.miles_" },
  ];

  it("uses the handle for the platform the deal is actually on", () => {
    expect(handleForDeal("instagram", channels)).toBe("_morgan.miles_");
  });

  it("falls back to any handle rather than showing none", () => {
    expect(handleForDeal("youtube", channels)).toBe("mo.tt");
    expect(handleForDeal(null, channels)).toBe("mo.tt");
  });

  it("returns null when the creator has no handle recorded", () => {
    expect(handleForDeal("instagram", [{ platform: "instagram", handle: null }])).toBeNull();
    expect(handleForDeal("instagram", [{ platform: "instagram", handle: "  " }])).toBeNull();
    expect(handleForDeal("instagram", [])).toBeNull();
  });
});

describe("handleAddsIdentity", () => {
  it("is the reported case: a first name says nothing among handles", () => {
    expect(handleAddsIdentity("Mo", "_morgan.miles_")).toBe(true);
    expect(handleAddsIdentity("Andrew", "a1swagyu")).toBe(true);
  });

  it("stays quiet when the name already is the handle, punctuation aside", () => {
    expect(handleAddsIdentity("6thGenFarmer", "6thGenFarmer")).toBe(false);
    expect(handleAddsIdentity("fab.rubi", "fab_rubi")).toBe(false);
    expect(handleAddsIdentity("TheOldCoupleOutdoors", "@theoldcoupleoutdoors")).toBe(false);
  });

  it("still shows a handle that merely overlaps the name — mild redundancy beats hiding it", () => {
    // The containment rule this replaced hid @_morgan.miles_ behind "Mo", because a
    // two-letter name is a substring of almost anything.
    expect(handleAddsIdentity("Joe Holland Fishing", "joeholland")).toBe(true);
  });

  it("has nothing to add without a handle", () => {
    expect(handleAddsIdentity("Mo", null)).toBe(false);
    expect(handleAddsIdentity("Mo", "")).toBe(false);
  });
});

describe("creatorSearchFields", () => {
  it("includes the handle and the email — what you can read off a card or a thread", () => {
    const fields = creatorSearchFields(
      { creator: "Mo", deliverables: null, campaign: "Wave 2" },
      "_morgan.miles_",
      "morganmilestravels@gmail.com"
    );
    expect(fields).toContain("_morgan.miles_");
    expect(fields).toContain("morganmilestravels@gmail.com");
    expect(fields).toContain("Wave 2");
  });
});
