import { NextResponse } from "next/server";
import { getPartnersWithHandles, getSetting } from "@/lib/db";
import { checkApiKey } from "@/lib/api-auth";
import { matchPartnerHandles } from "@/lib/api-resolve";

const MAX_HANDLES = 500;

/**
 * Handle → creator lookup, the partner counterpart of GET /api/deals.
 *
 *   GET /api/partners?handles=blackhikerbabe,@afghangstah
 *   GET /api/partners                      (the whole book, for building a mapping)
 *
 * Handles resolve through channel records, never through the partner's name: an import
 * files creators under whatever the source called them, and matching "Emily" to "Emily"
 * is what silently dropped rows in Creator intake. A creator with no channel handle
 * recorded therefore comes back as missing and must be addressed by id — which is why
 * the no-handles listing exists, so a caller can build that mapping without scraping.
 */
export async function GET(request: Request) {
  const auth = checkApiKey(
    request.headers.get("authorization"),
    request.headers.get("x-api-key"),
    getSetting<string>("api_key")
  );
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const url = new URL(request.url);
  const handlesParam = url.searchParams.get("handles");
  const partners = getPartnersWithHandles();

  if (handlesParam) {
    const handles = handlesParam
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (handles.length === 0) {
      return NextResponse.json({ error: "handles was empty." }, { status: 400 });
    }
    if (handles.length > MAX_HANDLES) {
      return NextResponse.json(
        { error: `At most ${MAX_HANDLES} handles per request.` },
        { status: 400 }
      );
    }
    const matches = matchPartnerHandles(handles, partners);
    return NextResponse.json({
      matches,
      found: matches.filter((m) => m.id != null).length,
      missing: matches.filter((m) => m.id == null && !m.ambiguous).map((m) => m.handle),
      ambiguous: matches
        .filter((m) => m.ambiguous)
        .map((m) => ({ handle: m.handle, ids: m.ambiguous!.map((a) => a.id) })),
    });
  }

  return NextResponse.json({
    partners: partners.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      handles: p.handles,
    })),
    count: partners.length,
    /** Addressable by id only — see the note above. */
    withoutHandle: partners.filter((p) => p.handles.length === 0).length,
  });
}
