import { getPartnerReport } from "@/lib/db";
import { readFile } from "@/lib/files";

/**
 * Opens a stored analytics report.
 *
 * Sits under /api so the session gate in proxy.ts covers it: these documents carry a
 * creator's audience data, and they are readable only by someone signed in — the route
 * itself takes no token, because there is no case for handing one out.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getPartnerReport(Number(id));
  if (!report) return new Response("Not found", { status: 404 });

  try {
    const body = readFile(report.file_path);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": report.mime || "application/octet-stream",
        // Inline: a PDF you have to download to glance at is a PDF you stop opening.
        "Content-Disposition": `inline; filename="${report.filename.replace(/"/g, "")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return new Response("The stored file is missing.", { status: 404 });
  }
}
