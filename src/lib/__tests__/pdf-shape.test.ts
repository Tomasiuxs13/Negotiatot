import { describe, expect, it } from "vitest";
import { pdfPageShape, tallPageWarning, UNREADABLE_ASPECT } from "../pdf-shape";

const pdf = (box: string) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Page/MediaBox[${box}]>>`, "latin1");

describe("pdfPageShape", () => {
  it("reads the reported Modash export's geometry", () => {
    // The real file: report-jim.weglewski.explores, one page, 588 x 8473 pt.
    const shape = pdfPageShape(pdf("0 0 588 8473"));
    expect(shape).toMatchObject({ widthPt: 588, heightPt: 8473 });
    expect(Math.round(shape!.ratio)).toBe(14);
  });

  it("reads an ordinary A4 page", () => {
    expect(pdfPageShape(pdf("0 0 595.28 841.89"))!.ratio).toBeCloseTo(1.41, 1);
  });

  it("handles a box with an offset origin", () => {
    expect(pdfPageShape(pdf("10 20 610 1040"))).toMatchObject({ widthPt: 600, heightPt: 1020 });
  });

  it("returns null rather than guessing when there is no box", () => {
    expect(pdfPageShape(Buffer.from("not a pdf"))).toBeNull();
    expect(pdfPageShape(pdf("0 0 0 800"))).toBeNull();
  });
});

describe("tallPageWarning", () => {
  it("warns about the export that cost a call and graded nothing", () => {
    const warning = tallPageWarning(pdfPageShape(pdf("0 0 588 8473")));
    expect(warning).toContain("14×");
    expect(warning).toContain("Screenshot the stats section");
  });

  it("says nothing about a normal report", () => {
    expect(tallPageWarning(pdfPageShape(pdf("0 0 595 842")))).toBeNull();
    expect(tallPageWarning(null)).toBeNull();
  });

  it("draws the line where width stops being legible, not at any tall page", () => {
    expect(UNREADABLE_ASPECT).toBe(4);
    expect(tallPageWarning({ widthPt: 600, heightPt: 2000, ratio: 3.3 })).toBeNull();
    expect(tallPageWarning({ widthPt: 600, heightPt: 3000, ratio: 5 })).not.toBeNull();
  });
});
