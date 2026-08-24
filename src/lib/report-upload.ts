import "server-only";
import sharp from "sharp";
import type { ImageMediaType } from "./claude";

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

export type ReadReport =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | { kind: "pdf"; pdfBase64: string }
  | { kind: "image"; image: { base64: string; mediaType: ImageMediaType } };

/** Reads the `report` form field into whichever shape performAnalysis takes. */
export async function readReportFile(file: FormDataEntryValue | null): Promise<ReadReport> {
  if (!(file instanceof File) || file.size === 0) return { kind: "none" };
  if (file.type.includes("pdf")) {
    if (file.size > MAX_PDF_BYTES) return { kind: "error", error: "Report PDF is too large (max 20 MB)." };
    return { kind: "pdf", pdfBase64: Buffer.from(await file.arrayBuffer()).toString("base64") };
  }
  if (IMAGE_TYPES.includes(file.type as ImageMediaType)) {
    if (file.size > MAX_IMAGE_BYTES) return { kind: "error", error: "Screenshot is too large (max 30 MB)." };
    try {
      return {
        kind: "image",
        image: await prepareImage(Buffer.from(await file.arrayBuffer()), file.type as ImageMediaType),
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
