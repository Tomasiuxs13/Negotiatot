import { NextResponse } from "next/server";
import { moveDealStage } from "@/app/pipeline-actions";
import { getDeal, getDeals, getSetting } from "@/lib/db";
import { checkApiKey } from "@/lib/api-auth";
import { matchHandles, normalizeHandle, parseStage, resolveTarget } from "@/lib/api-resolve";

/**
 * Bulk stage move.
 *
 *   POST /api/deals/stage
 *   { "dryRun": true, "items": [{ "handle": "DonShader", "stage": "negotiating" }] }
 *
 * Writes go through moveDealStage, the same function the board's drag-and-drop calls, so
 * every guard comes along: a completed deal cannot be dragged sideways, completion is
 * refused while tracked work is open, and moving into Agreed still locks the agreed price.
 *
 * A dry run reports each deal's CURRENT stage next to the requested one. That is the
 * check worth having — a creator who replied "not interested" is still sitting in
 * contacted, and seeing `from: "contacted"` beside `to: "analyzing"` is what catches the
 * mismatch before anything is written.
 */
export async function POST(request: Request) {
  const auth = checkApiKey(
    request.headers.get("authorization"),
    request.headers.get("x-api-key"),
    getSetting<string>("api_key")
  );
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const parsed = await readBatch(request);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { items, dryRun } = parsed;

  const handles = items
    .map((i) => (typeof i?.handle === "string" ? i.handle : null))
    .filter((h): h is string => Boolean(h));
  const matches = new Map(
    matchHandles(handles, getDeals()).map((m) => [normalizeHandle(m.handle), m])
  );

  const planned: Record<string, unknown>[] = [];
  const moved: Record<string, unknown>[] = [];
  const errors: { index: number; target: string; error: string }[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index] ?? {};
    const label = String(item.handle ?? item.id ?? "(unnamed)");

    const target = resolveTarget(item, matches);
    if (!target.ok) {
      errors.push({ index, target: label, error: target.error });
      continue;
    }
    const stage = parseStage(item.stage);
    if (!stage.ok) {
      errors.push({ index, target: label, error: stage.error });
      continue;
    }
    const deal = getDeal(target.id);
    if (!deal) {
      errors.push({ index, target: label, error: `deal ${target.id} not found` });
      continue;
    }

    const change = {
      id: deal.id,
      handle: deal.creator,
      from: deal.stage,
      to: stage.stage,
      ...(deal.stage === stage.stage ? { note: "already in this stage — no change" } : {}),
    };

    if (dryRun) {
      planned.push(change);
      continue;
    }

    const result = await moveDealStage(target.id, stage.stage);
    if (result?.error) errors.push({ index, target: label, error: result.error });
    else moved.push(change);
  }

  return NextResponse.json(dryRun ? { dryRun: true, wouldMove: planned, errors } : { moved, errors });
}

async function readBatch(
  request: Request
): Promise<{ items: Record<string, unknown>[]; dryRun: boolean } | { error: string }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: "Body must be JSON." };
  }
  const items = Array.isArray(body)
    ? body
    : Array.isArray((body as { items?: unknown })?.items)
      ? ((body as { items: unknown[] }).items)
      : null;
  if (!items) return { error: "Send a JSON array, or { items: [...] }." };
  if (items.length === 0) return { error: "The array is empty." };
  if (items.length > 200) return { error: "At most 200 items per request." };
  const dryRun = !Array.isArray(body) && (body as { dryRun?: unknown })?.dryRun === true;
  return { items: items as Record<string, unknown>[], dryRun };
}
