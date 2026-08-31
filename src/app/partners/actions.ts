"use server";

import { revalidatePath } from "next/cache";
import {
  createPartner,
  deletePartner,
  deletePartnerChannel,
  findPartnerByName,
  updatePartner,
  getCreatorCategories,
  upsertPartnerChannel,
} from "@/lib/db";
import { normalizeCategory } from "@/lib/categories";
import { parseColumns } from "@/lib/partner-columns";
import { setSetting } from "@/lib/db";

export async function createPartnerAction(fields: {
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  tags?: string[];
}): Promise<{ id?: number; error?: string }> {
  const name = fields.name.trim();
  if (!name) return { error: "Name is required." };
  if (findPartnerByName(name)) return { error: `"${name}" already exists.` };
  const id = createPartner({ ...fields, name });
  revalidatePath("/partners");
  return { id };
}

export async function updatePartnerAction(
  id: number,
  fields: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    tags?: string[];
    category?: string | null;
  }
): Promise<{ error?: string }> {
  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) return { error: "Name is required." };
    const clash = findPartnerByName(name);
    if (clash && clash.id !== id) return { error: `"${name}" already exists.` };
  }
  // Only a category from the managed list is stored; clearing it is still allowed.
  // Anything else would be the second spelling that makes the grouping worthless.
  const category =
    fields.category === undefined
      ? undefined
      : normalizeCategory(fields.category, getCreatorCategories());
  updatePartner(id, { ...fields, ...(category === undefined ? {} : { category }) });
  revalidatePath("/partners");
  revalidatePath(`/partners/${id}`);
  revalidatePath("/benchmarks");
  return {};
}

export async function archivePartnerAction(id: number) {
  updatePartner(id, { archived: 1 });
  revalidatePath("/partners");
  return {};
}

export async function deletePartnerAction(id: number) {
  deletePartner(id);
  // A deleted partner takes their deals with it, so refresh everywhere those show.
  revalidatePath("/partners");
  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath("/payments");
  revalidatePath("/benchmarks");
  return {};
}

export async function saveChannelAction(fields: {
  partnerId: number;
  platform: string;
  handle?: string;
  url?: string;
  followers?: number | null;
  avgViews?: number | null;
  engagementRate?: number | null;
}) {
  upsertPartnerChannel(fields);
  revalidatePath(`/partners/${fields.partnerId}`);
  return {};
}

export async function deleteChannelAction(channelId: number, partnerId: number) {
  deletePartnerChannel(channelId);
  revalidatePath(`/partners/${partnerId}`);
  return {};
}

/**
 * Which columns the Partners table shows. Stored rather than kept in the URL: a chosen
 * view is a working preference, not a thing you want to re-pick on every visit.
 */
export async function savePartnerColumnsAction(columns: string[]): Promise<{ error?: string }> {
  setSetting("partner_columns", parseColumns(columns));
  revalidatePath("/partners");
  return {};
}
