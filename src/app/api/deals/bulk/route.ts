import { NextResponse } from "next/server";
import { createDealAction } from "@/app/new/actions";
import { findPartnerByName, getPartnerDeals, getPartners, getSetting } from "@/lib/db";
import { TERMINAL_STAGES } from "@/lib/types";
import { BULK_MAX_ITEMS, normalizeBulkItem, type ProgramDefaults } from "@/lib/bulk-import";

/**
 * Bulk deal import — the outreach tool's door into the pipeline.
 *
 * POST a JSON array of items shaped like the New Deal form's fields (creatorName,
 * platform, email, stage "lead"|"contacted", …). Each row goes through the SAME create
 * path the form uses, so partner recognition, channel upkeep and validation cannot
 * drift between the two. Rows are independent: one bad row lands in `errors` while the
 * other nineteen are created.
 *
 * Duplicates are skipped, not doubled: a creator (matched by name or email) who already
 * has a live deal comes back in `duplicates` so the collision is caught before the
 * outreach email goes out — which is exactly the near-miss this exists to prevent.
 *
 * Analysis never runs from here. Stage defaults to "contacted" and "analyzing" is
 * refused: a file import that silently starts N model runs is a bill nobody reviewed.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }
  if (!Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON array of deal items." }, { status: 400 });
  }
  if (body.length === 0) {
    return NextResponse.json({ error: "The array is empty." }, { status: 400 });
  }
  if (body.length > BULK_MAX_ITEMS) {
    return NextResponse.json(
      { error: `At most ${BULK_MAX_ITEMS} items per request.` },
      { status: 400 }
    );
  }

  // The same program defaults the form preloads into its commission/discount inputs.
  const econ = getSetting<Record<string, number>>("unit_economics");
  const defaults: ProgramDefaults = {
    commissionType:
      Number(econ?.commissionPerOrder ?? 0) > 0
        ? "per_order"
        : Number(econ?.commissionPercent ?? 0) > 0
          ? "percent"
          : "none",
    commissionValue:
      Number(econ?.commissionPerOrder ?? 0) > 0
        ? Number(econ?.commissionPerOrder)
        : Number(econ?.commissionPercent ?? 0),
    discountType: econ?.discountFixed ? "fixed" : econ?.discountPercent ? "percent" : "none",
    discountValue: Number(econ?.discountFixed ?? econ?.discountPercent ?? 0),
  };

  const created: { id: number; creatorName: string }[] = [];
  const duplicates: string[] = [];
  const errors: { index: number; creatorName: string | null; error: string }[] = [];

  const partnerByEmail = (email: string) =>
    email ? getPartners().find((p) => p.email?.toLowerCase() === email.toLowerCase()) : undefined;

  for (let index = 0; index < body.length; index++) {
    const item = normalizeBulkItem(body[index], defaults);
    if (!item.ok) {
      errors.push({ index, creatorName: item.creatorName, error: item.error });
      continue;
    }

    // A live deal (any non-terminal stage) for the same creator means this row is a
    // collision, not a new collaboration. A creator with only completed/declined
    // history is a legitimate repeat target and passes through.
    const partner =
      findPartnerByName(item.creatorName) ?? partnerByEmail(item.fields.email);
    if (partner) {
      const live = getPartnerDeals(partner.id).some((d) => !TERMINAL_STAGES.includes(d.stage));
      if (live) {
        duplicates.push(item.creatorName);
        continue;
      }
    }

    const fd = new FormData();
    for (const [key, value] of Object.entries(item.fields)) {
      if (value !== "") fd.set(key, value);
    }
    for (const platform of item.platforms) fd.append("platforms", platform);

    try {
      const result = await createDealAction(fd);
      if (result.error || result.id == null) {
        errors.push({ index, creatorName: item.creatorName, error: result.error ?? "Create failed." });
      } else {
        created.push({ id: result.id, creatorName: item.creatorName });
      }
    } catch (err) {
      console.error("bulk import row failed:", err);
      errors.push({
        index,
        creatorName: item.creatorName,
        error: "Unexpected failure creating this row — see the server log.",
      });
    }
  }

  return NextResponse.json({ created, duplicates, errors });
}
