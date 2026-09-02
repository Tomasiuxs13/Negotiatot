import "server-only";
import sharp from "sharp";
import type { ImageMediaType } from "./claude";
import { saveFile } from "./files";
import { savePartnerReport } from "./db";
import { pdfPageShape, tallPageWarning, UNREADABLE_ASPECT } from "./pdf-shape";
import { renderPdfToStrips, type ReportImage } from "./pdf-strips";

/**
 * One reading of an uploaded analytics report (Modash, HypeAuditor, a screenshot),
 * shared by the intake form and the deal page's late attach — the same file must be
 * accepted, resized and rejected identically in both places, or "it worked when I
 * created the deal" and "it failed when I attached it later" become different truths
 * about the same PDF.
 */

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const IMAGE_TYPES: ImageMediaType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];
// Claude's hard limit is 8000px per side; ~2500px is plenty for reading stats and much cheaper.
const MAX_IMAGE_DIMENSION = 2500;

async function prepareImage(
  buffer: Buffer,
  originalType: ImageMediaType
): Promise<{ base64: string; mediaType: ImageMediaType }> {
  const meta = await sharp(buffer).metadata();
  const largest = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (largest > MAX_IMAGE_DIMENSION || buffer.length > 4 * 1024 * 1024) {
    const resized = await sharp(buffer)
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88 })
      .toBuffer();
    return { base64: resized.toString("base64"), mediaType: "image/jpeg" };
  }
  return { base64: buffer.toString("base64"), mediaType: originalType };
}

/**
 * The file as uploaded, kept so it can be filed against the creator.
 *
 * The analysis reads a resized, re-encoded copy; what gets stored is the original, because
 * the point of keeping it is to be able to open the document the numbers came from — and
 * a JPEG the app made at 2500px is not that document.
 */
export interface OriginalReport {
  buffer: Buffer;
  filename: string;
  mime: string;
}

export type ReadReport =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | {
      kind: "pdf";
      pdfBase64: string;
      original: OriginalReport;
      /**
       * A dashboard-shaped page rendered and cut into readable strips. When present the
       * strips go to the model instead of the document — the document is unreadable at
       * that shape, which is the whole reason the strips exist.
       */
      strips: ReportImage[] | null;
      /** Set only when the page is that shape AND rendering it failed. */
      tallPage: string | null;
    }
  | { kind: "image"; image: { base64: string; mediaType: ImageMediaType }; original: OriginalReport };

/** Reads the `report` form field into whichever shape performAnalysis takes. */
export async function readReportFile(file: FormDataEntryValue | null): Promise<ReadReport> {
  if (!(file instanceof File) || file.size === 0) return { kind: "none" };
  if (file.type.includes("pdf")) {
    if (file.size > MAX_PDF_BYTES) return { kind: "error", error: "Report PDF is too large (max 20 MB)." };
    const buffer = Buffer.from(await file.arrayBuffer());
    const shape = pdfPageShape(buffer);
    let strips: ReportImage[] | null = null;
    let tallPage: string | null = null;
    if (shape && shape.ratio > UNREADABLE_ASPECT) {
      try {
        strips = await renderPdfToStrips(buffer, shape);
      } catch (error) {
        console.error("Could not render the tall report into strips:", error);
      }
      // No strips means we could not make it readable; say so before a call is spent.
      if (!strips) tallPage = tallPageWarning(shape);
    }
    return {
      kind: "pdf",
      pdfBase64: buffer.toString("base64"),
      original: { buffer, filename: file.name || "report.pdf", mime: "application/pdf" },
      strips,
      tallPage,
    };
  }
  if (IMAGE_TYPES.includes(file.type as ImageMediaType)) {
    if (file.size > MAX_IMAGE_BYTES) return { kind: "error", error: "Screenshot is too large (max 30 MB)." };
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      return {
        kind: "image",
        image: await prepareImage(buffer, file.type as ImageMediaType),
        original: { buffer, filename: file.name || "report", mime: file.type },
      };
    } catch (err) {
      console.error("prepareImage failed:", err);
      return { kind: "error", error: "Couldn't read that image — is the file corrupted?" };
    }
  }
  return {
    kind: "error",
    error: "Unsupported file type — upload a PDF report or a PNG/JPEG/WebP screenshot.",
  };
}


/**
 * Files the uploaded report against the creator.
 *
 * Called from both upload paths — the intake form and the deal page — so a report is kept
 * wherever it arrives. Failure here must never take the analysis down with it: the point
 * of the upload is the pricing, and a full disk should cost you the archive copy, not the
 * verdict.
 */
export function fileReportAgainstPartner(
  report: ReadReport,
  partnerId: number | null | undefined,
  dealId: number | null
): number | null {
  if (partnerId == null) return null;
  const original =
    report.kind === "pdf" || report.kind === "image" ? report.original : null;
  if (!original) return null;
  try {
    const relative = saveFile(`reports/partner-${partnerId}`, original.filename, original.buffer);
    return savePartnerReport({
      partnerId,
      dealId,
      filename: original.filename,
      filePath: relative,
      mime: original.mime,
      bytes: original.buffer.length,
    });
  } catch (error) {
    console.error("Could not file the analytics report:", error);
    return null;
  }
}
