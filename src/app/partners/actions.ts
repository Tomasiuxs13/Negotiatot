"use server";

import { revalidatePath } from "next/cache";
import {
  createPartner,
  deletePartner,
  deletePartnerChannel,
  findPartnerByName,
  updatePartner,
  upsertPartnerChannel,
} from "@/lib/db";

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
  }
): Promise<{ error?: string }> {
  if (fields.name !== undefined) {
    const name = fields.name.trim();
    if (!name) return { error: "Name is required." };
    const clash = findPartnerByName(name);
    if (clash && clash.id !== id) return { error: `"${name}" already exists.` };
  }
  updatePartner(id, fields);
  revalidatePath("/partners");
  revalidatePath(`/partners/${id}`);
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
