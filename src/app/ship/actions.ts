"use server";

import { revalidatePath } from "next/cache";
import { getShipmentByToken, submitShipmentAddress } from "@/lib/fulfillment";

/**
 * The one public write in the app. It is reachable by anyone holding the link, so it
 * validates everything, accepts only the three address fields, resolves the shipment
 * by token alone — never by id — and goes read-only once the parcel has shipped.
 */
export async function submitAddressAction(
  token: string,
  fields: { recipient: string; address: string; phone: string }
) {
  const shipment = getShipmentByToken(token);
  if (!shipment) return { error: "This link is no longer valid." };
  if (shipment.status !== "to_prepare") {
    return { error: "This shipment is already on its way — contact us if the address is wrong." };
  }

  const recipient = fields.recipient.trim();
  const address = fields.address.trim();
  const phone = fields.phone.trim();
  if (!recipient) return { error: "Add the recipient's name." };
  if (address.length < 10) return { error: "That address looks incomplete." };
  if (recipient.length > 200 || address.length > 1000 || phone.length > 50) {
    return { error: "One of the fields is too long." };
  }

  submitShipmentAddress(token, { recipient, address, phone: phone || null });
  revalidatePath(`/deals/${shipment.deal_id}`);
  return {};
}
