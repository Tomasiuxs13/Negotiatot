import { NextResponse } from "next/server";
import { declineDealAction } from "@/app/pipeline-actions";
import { getDeal, getDeals, getSetting } from "@/lib/db";
import { checkApiKey } from "@/lib/api-auth";
import { matchHandles, normalizeHandle, parseDeclineReason, resolveTarget } from "@/lib/api-resolve";
import { DECLINE_REASON_LABEL } from "@/lib/types";

/**
 * Bulk decline.
 *
 *   POST /api/deals/decline
 *   { "dryRun": true, "items": [{ "handle": "DonShader", "reason": "no_reply", "note": "…" }] }
 *
 * Every write goes through declineDealAction, the same function the UI calls, so the
 * won-stage guards and the revisit-date rule cannot drift between the two.
 *
 * The reason is validated against the enum rather than written as free text: the UI
 * renders it from a fixed map, so an unrecognised value would show a deal declined for no
 * stated cause. Both the stored key ("no_reply") and the label the manager sees
 * ("Went quiet") are accepted.
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

  // One lookup for the whole batch rather than per item.
  const handles = items
    .map((i) => (typeof i?.handle === "string" ? i.handle : null))
    .filter((h): h is string => Boolean(h));
  const matches = new Map(
    matchHandles(handles, getDeals()).map((m) => [normalizeHandle(m.handle), m])
  );

  const planned: Record<string, unknown>[] = [];
  const declined: Record<string, unknown>[] = [];
  const errors: { index: number; target: string; error: string }[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index] ?? {};
    const label = String(item.handle ?? item.id ?? "(unnamed)");

    const target = resolveTarget(item, matches);
    if (!target.ok) {
      errors.push({ index, target: label, error: target.error });
      continue;
    }
    const reason = parseDeclineReason(item.reason);
    if (!reason.ok) {
      errors.push({ index, target: label, error: reason.error });
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
      to: "declined",
      reason: reason.reason,
      reasonLabel: DECLINE_REASON_LABEL[reason.reason],
      ...(deal.stage === "declined" ? { note: "already declined — would be re-declined" } : {}),
    };

    if (dryRun) {
      planned.push(change);
      continue;
    }

    const result = await declineDealAction(target.id, {
      reason: reason.reason,
      note: typeof item.note === "string" ? item.note : undefined,
      revisitOn: typeof item.revisitOn === "string" ? item.revisitOn : null,
    });
    if (result?.error) errors.push({ index, target: label, error: result.error });
    else declined.push(change);
  }

  return NextResponse.json(
    dryRun ? { dryRun: true, wouldDecline: planned, errors } : { declined, errors }
  );
}

/** Accepts either a bare array or { items, dryRun } — a script should not have to guess. */
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
