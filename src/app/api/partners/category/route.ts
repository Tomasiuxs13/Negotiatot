import { NextResponse } from "next/server";
import {
  getCreatorCategories,
  getPartner,
  getPartnersWithHandles,
  getSetting,
  inTransaction,
  updatePartner,
} from "@/lib/db";
import { checkApiKey } from "@/lib/api-auth";
import {
  matchPartnerHandles,
  normalizeHandle,
  parsePartnerCategory,
  resolveTarget,
} from "@/lib/api-resolve";

const MAX_ITEMS = 500;
const NOUN = { plural: "creators", place: "your creators" };

/**
 * Bulk creator categorisation.
 *
 *   POST /api/partners/category
 *   { "dryRun": true, "items": [{ "handle": "blackhikerbabe", "category": "Camping & hiking" },
 *                               { "id": 143, "category": "Home & DIY" }] }
 *
 * Only the category column is written. There is no read-modify-write of the partner row:
 * the profile form posts the whole record, so driving it to change one field means
 * echoing five others back and blanking them if you miss one. Here a run that touches
 * 340 creators cannot lose a phone number.
 *
 * The whole batch is validated before anything is written, and the write is one
 * transaction — a half-applied categorisation is worse than none, because you cannot see
 * where it stopped.
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

  const allowed = getCreatorCategories();
  const partners = getPartnersWithHandles();
  const handles = items
    .map((item) => (typeof item?.handle === "string" ? item.handle : null))
    .filter((handle): handle is string => Boolean(handle));
  const matches = new Map(
    matchPartnerHandles(handles, partners).map((m) => [normalizeHandle(m.handle), m])
  );

  /** Resolved plan. Nothing is written until every item has passed. */
  const plan: { handle: string | null; id: number; from: string | null; to: string }[] = [];
  const missing: string[] = [];
  const ambiguous: { handle: string; ids: number[] }[] = [];

  for (let index = 0; index < items.length; index++) {
    const item = items[index] ?? {};
    const label = typeof item.handle === "string" ? item.handle.trim() : String(item.id ?? "");

    // An unknown category fails the batch rather than this row: a run of 340 that silently
    // skips the fourteen rows with a typo leaves you believing they were set.
    const category = parsePartnerCategory(item.category, allowed);
    if (!category.ok) {
      return NextResponse.json(
        { error: `item ${index}${label ? ` (${label})` : ""}: ${category.error}` },
        { status: 400 }
      );
    }

    const target = resolveTarget(item, matches, NOUN);
    if (!target.ok) {
      // A handle nobody has is a gap in the caller's list, not a malformed request.
      const match = typeof item.handle === "string" ? matches.get(normalizeHandle(item.handle)) : undefined;
      if (match?.ambiguous) {
        ambiguous.push({ handle: match.handle, ids: match.ambiguous.map((a) => a.id) });
        continue;
      }
      if (match) {
        missing.push(match.handle);
        continue;
      }
      return NextResponse.json({ error: `item ${index}: ${target.error}` }, { status: 400 });
    }

    const partner = getPartner(target.id);
    if (!partner) {
      missing.push(label || String(target.id));
      continue;
    }
    plan.push({
      handle: target.handle ?? null,
      id: partner.id,
      from: partner.category ?? null,
      to: category.category,
    });
  }

  const updated = plan.filter((entry) => entry.from !== entry.to);
  const unchanged = plan.filter((entry) => entry.from === entry.to);

  if (!dryRun && updated.length > 0) {
    inTransaction(() => {
      for (const entry of updated) updatePartner(entry.id, { category: entry.to });
    });
  }

  return NextResponse.json({
    ...(dryRun ? { dryRun: true } : {}),
    updated,
    unchanged,
    missing,
    ambiguous,
  });
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
      ? (body as { items: unknown[] }).items
      : null;
  if (!items) return { error: "Send a JSON array, or { items: [...] }." };
  if (items.length === 0) return { error: "The array is empty." };
  if (items.length > MAX_ITEMS) return { error: `At most ${MAX_ITEMS} items per request.` };
  const dryRun = !Array.isArray(body) && (body as { dryRun?: unknown })?.dryRun === true;
  return { items: items as Record<string, unknown>[], dryRun };
}
