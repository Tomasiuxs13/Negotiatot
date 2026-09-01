/**
 * How tall a PDF page is relative to its width, and whether that makes it unreadable.
 *
 * Modash and similar tools export a whole dashboard as ONE page: 588 × 8473 pt, an aspect
 * of 1:14. Claude renders each PDF page to a single image and downscales it to fit, so a
 * page fourteen times taller than it is wide comes back about a hundred pixels across —
 * the figures survive as shapes, not numbers. That is why two of these reports produced
 * "avg views inferred from an unlabelled numeric block" and one graded nothing at all,
 * after a paid call each time.
 *
 * Byte-level parsing rather than a PDF library: this needs the page box and nothing else,
 * and a dependency that renders PDFs is a different decision from noticing they are tall.
 */
export interface PdfShape {
  widthPt: number;
  heightPt: number;
  /** Height ÷ width. A portrait A4 is 1.41; a Modash export is around 14. */
  ratio: number;
}

/** Above this, the page's width collapses far enough that text stops being legible. */
export const UNREADABLE_ASPECT = 4;

export function pdfPageShape(bytes: Buffer | Uint8Array): PdfShape | null {
  // Latin-1 keeps byte offsets honest; the boxes are ASCII inside a binary file.
  const text = Buffer.from(bytes).toString("latin1");
  const match = /\/MediaBox\s*\[\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)\s*\]/.exec(text);
  if (!match) return null;
  const [x0, y0, x1, y1] = match.slice(1, 5).map(Number);
  const widthPt = Math.abs(x1 - x0);
  const heightPt = Math.abs(y1 - y0);
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt <= 0 || heightPt <= 0) {
    return null;
  }
  return { widthPt, heightPt, ratio: heightPt / widthPt };
}

/**
 * The warning to show before spending a call on a report that cannot be read.
 *
 * Phrased as what to do instead, because "this PDF is tall" is not actionable and a
 * screenshot of the stats block is.
 */
export function tallPageWarning(shape: PdfShape | null): string | null {
  if (!shape || shape.ratio <= UNREADABLE_ASPECT) return null;
  return (
    `This export is one page ${Math.round(shape.ratio)}× taller than it is wide ` +
    `(${Math.round(shape.widthPt)} × ${Math.round(shape.heightPt)} pt). Claude renders each PDF page ` +
    `as a single image and scales it to fit, so a page this shape arrives too narrow to read and the ` +
    `figures come back as guesses or not at all. Screenshot the stats section and upload that instead, ` +
    `or set the audience numbers with "Correct this" — either reads perfectly.`
  );
}
