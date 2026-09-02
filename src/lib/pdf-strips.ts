import sharp from "sharp";
import type { ImageMediaType } from "./claude";
import type { PdfShape } from "./pdf-shape";

/**
 * Turns a dashboard-shaped PDF into images the model can actually read.
 *
 * A Modash export is one page 588 × 8473 pt. Sent as a document it is rendered to a single
 * image and scaled to fit, arriving about a hundred pixels wide — the numbers survive as
 * shapes. Rendered ourselves at a readable width and cut into page-shaped strips, the same
 * file becomes eleven ordinary screenshots, each of which reads perfectly.
 *
 * Strips overlap by a few rows so a stat card sitting on a cut line appears whole in one
 * of them rather than as two halves in neither.
 */

/** Render width. The PDF is 588 pt wide; 1000 px is a comfortable 1.7× of that. */
export const STRIP_WIDTH = 1000;
/** Strip height. 1000 × 1400 is a normal portrait page — the shape Claude reads best. */
export const STRIP_HEIGHT = 1400;
/** Rows repeated between consecutive strips so nothing is cut in half. */
export const STRIP_OVERLAP = 80;
/** Beyond this the report is not a dashboard, it is a book; send it as a document. */
export const MAX_STRIPS = 16;

export interface StripPlan {
  top: number;
  height: number;
}

/** Where each strip starts and how tall it is, for a rendered image of `totalHeight`. */
export function planStrips(
  totalHeight: number,
  stripHeight: number = STRIP_HEIGHT,
  overlap: number = STRIP_OVERLAP
): StripPlan[] {
  if (totalHeight <= stripHeight) return [{ top: 0, height: totalHeight }];
  const step = stripHeight - overlap;
  const plan: StripPlan[] = [];
  for (let top = 0; top < totalHeight; top += step) {
    const height = Math.min(stripHeight, totalHeight - top);
    plan.push({ top, height });
    if (top + height >= totalHeight) break;
  }
  return plan;
}

export interface ReportImage {
  base64: string;
  mediaType: ImageMediaType;
}

/**
 * Renders the first page at STRIP_WIDTH and slices it. Returns null when the page would
 * need more than MAX_STRIPS — that is a multi-section document, not a tall dashboard, and
 * the caller should send it whole.
 */
export async function renderPdfToStrips(pdf: Buffer, shape: PdfShape): Promise<ReportImage[] | null> {
  // Loaded lazily: pdfjs pulls in a wasm runtime and a native canvas, and most requests
  // never touch a PDF at all.
  const { pdf: render } = await import("pdf-to-img");
  const scale = STRIP_WIDTH / shape.widthPt;
  const pages = await render(pdf, { scale });
  let page: Buffer | null = null;
  for await (const png of pages) {
    page = Buffer.from(png);
    break;
  }
  if (!page) return null;

  const meta = await sharp(page).metadata();
  const height = meta.height ?? 0;
  const width = meta.width ?? STRIP_WIDTH;
  if (!height) return null;

  const plan = planStrips(height);
  if (plan.length > MAX_STRIPS) return null;

  const strips: ReportImage[] = [];
  for (const { top, height: h } of plan) {
    const buf = await sharp(page)
      .extract({ left: 0, top, width, height: h })
      .jpeg({ quality: 88 })
      .toBuffer();
    strips.push({ base64: buf.toString("base64"), mediaType: "image/jpeg" });
  }
  return strips;
}
