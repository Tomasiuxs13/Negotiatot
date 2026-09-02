import { describe, expect, it } from "vitest";
import { costScopeLine } from "../ladder-notes";

describe("costScopeLine", () => {
  it("quotes the manager's own scope verbatim", () => {
    const s = costScopeLine({ scopeText: "3 YouTube integrations", pieces: 3, fee: 2700 });
    expect(s.text).toBe("for 3 YouTube integrations · fee about $900 each");
    expect(s.assumed).toBe(false);
  });

  /** The case the panel existed in for months: a number with nothing behind it. */
  it("marks a Playbook-derived bundle as assumed", () => {
    const s = costScopeLine({ scopeText: null, pieces: 2, fee: 164 });
    expect(s.text).toBe("for 2 pieces of content · fee about $82 each");
    expect(s.assumed).toBe(true);
  });

  it("treats blank and whitespace scope as unwritten", () => {
    expect(costScopeLine({ scopeText: "   ", pieces: 1 }).assumed).toBe(true);
  });

  it("omits the per-piece figure on a single-piece deal", () => {
    const s = costScopeLine({ scopeText: "1 IG reel", pieces: 1, fee: 500 });
    expect(s.text).toBe("for 1 IG reel");
  });

  it("omits the per-piece figure when there is no fee yet", () => {
    const s = costScopeLine({ scopeText: null, pieces: 3, fee: 0 });
    expect(s.text).toBe("for 3 pieces of content");
    expect(s.assumed).toBe(true);
  });

  it("never divides by zero or renders a fractional bundle", () => {
    expect(costScopeLine({ scopeText: null, pieces: 0, fee: 100 }).text).toBe(
      "for 1 piece of content"
    );
    expect(costScopeLine({ scopeText: null, pieces: 2.4, fee: 100 }).text).toBe(
      "for 2 pieces of content · fee about $50 each"
    );
  });
});
