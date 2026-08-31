import { describe, it, expect } from "vitest";
import {
  matchHandles,
  matchPartnerHandles,
  normalizeHandle,
  parsePartnerCategory,
  parseDeclineReason,
  parseStage,
  resolveTarget,
  type HandleMatch,
} from "../api-resolve";
import type { Stage } from "../types";

const deal = (id: number, creator: string, stage: Stage) => ({ id, creator, stage });

describe("matchHandles", () => {
  const deals = [
    deal(1, "DonShader", "contacted"),
    deal(2, "TheEldredgeFam", "analyzing"),
    deal(3, "Gary Bembridge", "declined"),
  ];

  it("resolves a handle to its id and stage — the lookup that replaces DOM scraping", () => {
    expect(matchHandles(["DonShader"], deals)[0]).toEqual({
      handle: "DonShader",
      id: 1,
      stage: "contacted",
      live: true,
    });
  });

  it("is case-insensitive and tolerates a leading @", () => {
    expect(matchHandles(["@donshader", "THEELDREDGEFAM"], deals).map((m) => m.id)).toEqual([1, 2]);
  });

  it("reports an unknown handle as null rather than failing the batch", () => {
    expect(matchHandles(["nobody"], deals)[0]).toEqual({
      handle: "nobody",
      id: null,
      stage: null,
      live: false,
    });
  });

  it("marks a closed deal as not live — history is not a pipeline clash", () => {
    const m = matchHandles(["Gary Bembridge"], deals)[0];
    expect(m.id).toBe(3);
    expect(m.live).toBe(false);
  });

  it("picks the single live deal when closed history sits alongside it, and still lists both", () => {
    const withHistory = [...deals, deal(4, "Gary Bembridge", "negotiating")];
    const m = matchHandles(["Gary Bembridge"], withHistory)[0];
    expect(m.id).toBe(4);
    expect(m.live).toBe(true);
    expect(m.ambiguous).toHaveLength(2);
  });

  it("refuses to guess between two live deals — the case that must never auto-resolve", () => {
    const twoLive = [deal(5, "Twice", "contacted"), deal(6, "Twice", "negotiating")];
    const m = matchHandles(["Twice"], twoLive)[0];
    expect(m.id).toBeNull();
    expect(m.ambiguous).toHaveLength(2);
  });
});

describe("parseDeclineReason", () => {
  it("accepts the stored key", () => {
    expect(parseDeclineReason("no_reply")).toEqual({ ok: true, reason: "no_reply" });
  });

  it("accepts the label the manager sees in the UI", () => {
    expect(parseDeclineReason("Went quiet")).toEqual({ ok: true, reason: "no_reply" });
    expect(parseDeclineReason("above our walk-away")).toEqual({ ok: true, reason: "too_expensive" });
  });

  it("refuses free text — an unknown reason renders blank in the UI", () => {
    const r = parseDeclineReason("they ghosted us lol");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no_reply");
  });

  it("refuses an empty or non-string reason", () => {
    expect(parseDeclineReason("").ok).toBe(false);
    expect(parseDeclineReason(undefined).ok).toBe(false);
    expect(parseDeclineReason(42).ok).toBe(false);
  });
});

describe("parseStage", () => {
  it("accepts a valid stage and normalises spacing", () => {
    expect(parseStage("negotiating")).toEqual({ ok: true, stage: "negotiating" });
    expect(parseStage("Offer Sent")).toEqual({ ok: true, stage: "offer_sent" });
  });

  it("refuses an unknown stage, naming the valid ones", () => {
    const r = parseStage("review");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("negotiating");
  });
});

describe("resolveTarget", () => {
  const matches = new Map<string, HandleMatch>([
    ["donshader", { handle: "DonShader", id: 1, stage: "contacted", live: true }],
    ["twice", { handle: "Twice", id: null, stage: null, live: true, ambiguous: [
      { id: 5, stage: "contacted" }, { id: 6, stage: "negotiating" },
    ] }],
  ]);

  it("prefers an explicit id", () => {
    expect(resolveTarget({ id: 42 }, matches)).toEqual({ ok: true, id: 42 });
  });

  it("resolves a handle", () => {
    expect(resolveTarget({ handle: "@DonShader" }, matches)).toMatchObject({ ok: true, id: 1 });
  });

  it("refuses an ambiguous handle and says to send an id", () => {
    const r = resolveTarget({ handle: "Twice" }, matches);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("send an explicit id");
  });

  it("refuses an unknown handle and an item naming neither", () => {
    expect(resolveTarget({ handle: "ghost" }, matches).ok).toBe(false);
    expect(resolveTarget({}, matches).ok).toBe(false);
  });

  it("rejects a non-positive or fractional id rather than querying for it", () => {
    expect(resolveTarget({ id: 0 }, matches).ok).toBe(false);
    expect(resolveTarget({ id: 1.5 }, matches).ok).toBe(false);
  });
});

describe("normalizeHandle", () => {
  it("strips @, trims and lowercases", () => {
    expect(normalizeHandle("  @MixedCase ")).toBe("mixedcase");
  });
});

describe("matchPartnerHandles", () => {
  const partners = [
    { id: 373, name: "blackhikerbabe", category: null, handles: ["blackhikerbabe"] },
    { id: 354, name: "afghangstah", category: "Travel", handles: ["@Afghangstah"] },
    { id: 353, name: "Andrew", category: "Travel", handles: ["a1swagyu"] },
    // Reported live: a creator with no channel handle recorded at all.
    { id: 143, name: "6thGenFarmer", category: "Home & DIY", handles: [] },
  ];

  it("resolves a handle to its creator, ignoring case and a leading @", () => {
    const [plain, at] = matchPartnerHandles(["BlackHikerBabe", "@afghangstah"], partners);
    expect(plain.id).toBe(373);
    expect(at).toMatchObject({ id: 354, name: "afghangstah", category: "Travel" });
  });

  it("never matches on the partner's name — the failure that dropped Emily and Jay", () => {
    // "Andrew" is this creator's name; their handle is a1swagyu. Names are not identity.
    expect(matchPartnerHandles(["Andrew"], partners)[0].id).toBeNull();
    expect(matchPartnerHandles(["a1swagyu"], partners)[0].id).toBe(353);
  });

  it("reports a creator with no channel handle as missing rather than guessing", () => {
    expect(matchPartnerHandles(["6thGenFarmer"], partners)[0]).toEqual({
      handle: "6thGenFarmer",
      id: null,
      name: null,
      category: null,
    });
  });

  it("refuses to choose when one handle belongs to two creators", () => {
    const clash = matchPartnerHandles(["emily"], [
      { id: 381, name: "Emily", category: null, handles: ["emily"] },
      { id: 447, name: "Emily", category: null, handles: ["Emily"] },
    ]);
    expect(clash[0].id).toBeNull();
    expect(clash[0].ambiguous).toEqual([
      { id: 381, name: "Emily" },
      { id: 447, name: "Emily" },
    ]);
  });

  it("counts one creator once even when the handle repeats across their channels", () => {
    const same = matchPartnerHandles(["dual"], [
      { id: 9, name: "Dual", category: null, handles: ["dual", "@Dual"] },
    ]);
    expect(same[0].id).toBe(9);
    expect(same[0].ambiguous).toBeUndefined();
  });
});

describe("parsePartnerCategory", () => {
  const allowed = ["Outdoors & hunting", "Camping & hiking", "Home & DIY"];

  it("returns the list's own spelling for a case-insensitive match", () => {
    expect(parsePartnerCategory("camping & HIKING", allowed)).toEqual({
      ok: true,
      category: "Camping & hiking",
    });
  });

  it("names the offending value, in the style the deals API uses", () => {
    const result = parsePartnerCategory("Camping", allowed);
    expect(result).toEqual({
      ok: false,
      error: 'unknown category "Camping" — use one of: Outdoors & hunting, Camping & hiking, Home & DIY',
    });
  });

  it("refuses an empty or non-string category rather than clearing one", () => {
    expect(parsePartnerCategory("", allowed).ok).toBe(false);
    expect(parsePartnerCategory(null, allowed).ok).toBe(false);
    expect(parsePartnerCategory(42, allowed).ok).toBe(false);
  });
});
