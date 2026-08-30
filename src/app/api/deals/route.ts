import { NextResponse } from "next/server";
import { getDeals, getSetting } from "@/lib/db";
import { checkApiKey } from "@/lib/api-auth";
import { matchHandles } from "@/lib/api-resolve";

/**
 * Handle → deal lookup. The question every script needs answered first: is this creator
 * already in the pipeline, and where?
 *
 * Without it a caller has to scrape ids out of the list markup, which breaks whenever the
 * page changes and — worse — cannot tell a live deal from closed history. That gap is what
 * let five duplicate drafts go out.
 *
 *   GET /api/deals?handles=DonShader,@TheEldredgeFam
 *   GET /api/deals?stage=contacted        (whole stage, no handles needed)
 *
 * A creator with two live deals comes back with id: null and every candidate listed. The
 * lookup never guesses, because the next call after this one usually writes.
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
  const stageFilter = url.searchParams.get("stage");
  const deals = getDeals();

  if (handlesParam) {
    const handles = handlesParam
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    if (handles.length === 0) {
      return NextResponse.json({ error: "handles was empty." }, { status: 400 });
    }
    if (handles.length > 500) {
      return NextResponse.json({ error: "At most 500 handles per request." }, { status: 400 });
    }
    const matches = matchHandles(handles, deals);
    return NextResponse.json({
      matches,
      found: matches.filter((m) => m.id != null).length,
      missing: matches.filter((m) => m.id == null && !m.ambiguous).map((m) => m.handle),
      ambiguous: matches.filter((m) => m.ambiguous && m.id == null).map((m) => m.handle),
    });
  }

  // No handles: list the pipeline, optionally one stage. Same row shape either way, so a
  // caller can use one parser for both.
  const rows = (stageFilter ? deals.filter((d) => d.stage === stageFilter) : deals).map((d) => ({
    handle: d.creator,
    id: d.id,
    stage: d.stage,
    updatedAt: d.updated_at,
  }));
  return NextResponse.json({ deals: rows, count: rows.length });
}
