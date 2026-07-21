import db from "./db";
import { addDays, nextPaymentStatus } from "./fulfillment-rules";
import type {
  ContentItem,
  ContentStatus,
  Contract,
  ParsedTerms,
  PaymentItem,
  PaymentStatus,
  PaymentTrigger,
  Shipment,
  ShipmentStatus,
} from "./fulfillment-types";

// Re-exported so server code can import shapes and queries from one place.
export * from "./fulfillment-types";

/* -------------------------------------------------------------- contracts */

export function getContract(dealId: number): Contract | undefined {
  return db
    .prepare("SELECT * FROM contracts WHERE deal_id = ? ORDER BY id DESC LIMIT 1")
    .get(dealId) as Contract | undefined;
}

export function getContractById(id: number): Contract | undefined {
  return db.prepare("SELECT * FROM contracts WHERE id = ?").get(id) as Contract | undefined;
}

export function createContract(fields: {
  dealId: number;
  partnerId: number | null;
  filename: string;
  filePath: string;
  mime: string;
}): number {
  const info = db
    .prepare(
      `INSERT INTO contracts (deal_id, partner_id, filename, file_path, mime, status)
       VALUES (?, ?, ?, ?, ?, 'parsing')`
    )
    .run(fields.dealId, fields.partnerId, fields.filename, fields.filePath, fields.mime);
  return Number(info.lastInsertRowid);
}

export function setContractTerms(id: number, terms: ParsedTerms) {
  db.prepare("UPDATE contracts SET parsed_terms = ?, status = 'parsed', parse_error = NULL WHERE id = ?").run(
    JSON.stringify(terms),
    id
  );
}

export function setContractError(id: number, error: string) {
  db.prepare("UPDATE contracts SET status = 'uploaded', parse_error = ? WHERE id = ?").run(error, id);
}

export function confirmContract(id: number, terms: ParsedTerms, signedAt: string | null) {
  db.prepare(
    "UPDATE contracts SET parsed_terms = ?, status = 'confirmed', signed_at = ? WHERE id = ?"
  ).run(JSON.stringify(terms), signedAt, id);
}

export function parseTerms(raw: string | null | undefined): ParsedTerms | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ParsedTerms;
  } catch {
    return null;
  }
}

/* ---------------------------------------------------------- content items */

export function getAllContentItems(): ContentItem[] {
  return db.prepare("SELECT * FROM content_items").all() as ContentItem[];
}

export function getAllShipments(): Shipment[] {
  return db.prepare("SELECT * FROM shipments").all() as Shipment[];
}

export function getContentItems(dealId: number): ContentItem[] {
  return db
    .prepare("SELECT * FROM content_items WHERE deal_id = ? ORDER BY due_date IS NULL, due_date, id")
    .all(dealId) as ContentItem[];
}

export function createContentItem(fields: {
  dealId: number;
  partnerId: number | null;
  title: string;
  platform?: string | null;
  dueDate?: string | null;
  dueRule?: string | null;
  dueDaysAfterDelivery?: number | null;
}): number {
  const info = db
    .prepare(
      `INSERT INTO content_items (deal_id, partner_id, title, platform, due_date, due_rule, due_days_after_delivery)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.dealId,
      fields.partnerId,
      fields.title,
      fields.platform ?? null,
      fields.dueDate ?? null,
      fields.dueRule ?? null,
      fields.dueDaysAfterDelivery ?? null
    );
  return Number(info.lastInsertRowid);
}

export function updateContentItem(
  id: number,
  fields: { status?: ContentStatus; postedUrl?: string | null; dueDate?: string | null; notes?: string | null }
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.status !== undefined) {
    sets.push("status = ?");
    params.push(fields.status);
  }
  if (fields.postedUrl !== undefined) {
    sets.push("posted_url = ?");
    params.push(fields.postedUrl);
  }
  if (fields.dueDate !== undefined) {
    sets.push("due_date = ?");
    params.push(fields.dueDate);
  }
  if (fields.notes !== undefined) {
    sets.push("notes = ?");
    params.push(fields.notes);
  }
  if (sets.length === 0) return;
  db.prepare(
    `UPDATE content_items SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`
  ).run(...params, id);
}

export function deleteContentItem(id: number) {
  db.prepare("DELETE FROM content_items WHERE id = ?").run(id);
}

/* ---------------------------------------------------------- payment items */

export function getPaymentItems(dealId: number): PaymentItem[] {
  return db
    .prepare("SELECT * FROM payment_items WHERE deal_id = ? ORDER BY id")
    .all(dealId) as PaymentItem[];
}

export function getAllPaymentItems(): (PaymentItem & { creator: string })[] {
  return db
    .prepare(
      `SELECT p.*, d.creator FROM payment_items p
       JOIN deals d ON d.id = p.deal_id
       ORDER BY CASE p.status WHEN 'approvable' THEN 0 WHEN 'pending' THEN 1
                              WHEN 'approved' THEN 2 ELSE 3 END, p.id`
    )
    .all() as (PaymentItem & { creator: string })[];
}

export function createPaymentItem(fields: {
  dealId: number;
  partnerId: number | null;
  description: string;
  amount: number;
  trigger: PaymentTrigger;
  dueDate?: string | null;
  linkedContentIds?: number[];
}): number {
  // Signing fees have nothing to wait for — they're immediately approvable.
  const status: PaymentStatus = fields.trigger === "on_signing" ? "approvable" : "pending";
  const info = db
    .prepare(
      `INSERT INTO payment_items (deal_id, partner_id, description, amount, trigger, due_date, linked_content_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.dealId,
      fields.partnerId,
      fields.description,
      Math.round(fields.amount),
      fields.trigger,
      fields.dueDate ?? null,
      JSON.stringify(fields.linkedContentIds ?? []),
      status
    );
  return Number(info.lastInsertRowid);
}

export function updatePaymentItem(
  id: number,
  fields: { status?: PaymentStatus; amount?: number; dueDate?: string | null }
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.status !== undefined) {
    sets.push("status = ?");
    params.push(fields.status);
    if (fields.status === "approved") sets.push("approved_at = datetime('now')");
    if (fields.status === "paid") sets.push("paid_at = datetime('now')");
  }
  if (fields.amount !== undefined) {
    sets.push("amount = ?");
    params.push(Math.round(fields.amount));
  }
  if (fields.dueDate !== undefined) {
    sets.push("due_date = ?");
    params.push(fields.dueDate);
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE payment_items SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);
}

export function deletePaymentItem(id: number) {
  db.prepare("DELETE FROM payment_items WHERE id = ?").run(id);
}

/* ------------------------------------------------------------- shipments */

export function getShipments(dealId: number): Shipment[] {
  return db.prepare("SELECT * FROM shipments WHERE deal_id = ? ORDER BY id").all(dealId) as Shipment[];
}

export function createShipment(fields: {
  dealId: number;
  partnerId: number | null;
  product: string;
  value?: number | null;
  address?: string | null;
}): number {
  const info = db
    .prepare(
      "INSERT INTO shipments (deal_id, partner_id, product, value, address) VALUES (?, ?, ?, ?, ?)"
    )
    .run(fields.dealId, fields.partnerId, fields.product, fields.value ?? null, fields.address ?? null);
  return Number(info.lastInsertRowid);
}

export function updateShipment(
  id: number,
  fields: {
    product?: string;
    value?: number | null;
    address?: string | null;
    carrier?: string | null;
    tracking?: string | null;
    status?: ShipmentStatus;
  }
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, v: unknown) => {
    sets.push(`${col} = ?`);
    params.push(v);
  };
  if (fields.product !== undefined) push("product", fields.product);
  if (fields.value !== undefined) push("value", fields.value);
  if (fields.address !== undefined) push("address", fields.address);
  if (fields.carrier !== undefined) push("carrier", fields.carrier);
  if (fields.tracking !== undefined) push("tracking", fields.tracking);
  if (fields.status !== undefined) {
    push("status", fields.status);
    if (fields.status === "shipped") sets.push("shipped_at = datetime('now')");
    if (fields.status === "delivered") sets.push("delivered_at = datetime('now')");
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE shipments SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);
}

export function deleteShipment(id: number) {
  db.prepare("DELETE FROM shipments WHERE id = ?").run(id);
}

/* ------------------------------------------------------------ derived state */

/**
 * Marking a shipment delivered starts the content clock: any item whose deadline was
 * expressed relative to delivery ("14 days after product arrives") gets a real date.
 */
export function resolveDueDatesAfterDelivery(dealId: number, deliveredAt: string) {
  const items = db
    .prepare(
      `SELECT id, due_days_after_delivery FROM content_items
       WHERE deal_id = ? AND due_date IS NULL AND due_days_after_delivery IS NOT NULL`
    )
    .all(dealId) as { id: number; due_days_after_delivery: number }[];

  const update = db.prepare(
    "UPDATE content_items SET due_date = ?, updated_at = datetime('now') WHERE id = ?"
  );
  for (const item of items) {
    update.run(addDays(deliveredAt, item.due_days_after_delivery), item.id);
  }
  return items.length;
}

/**
 * Recomputes which payments are ready for approval. Called after anything that could
 * change the answer — content verified, product delivered, items created.
 */
export function refreshPaymentStatuses(dealId: number) {
  const contentItems = getContentItems(dealId);
  const productDelivered = getShipments(dealId).some((s) => s.status === "delivered");
  const payments = getPaymentItems(dealId);

  const update = db.prepare("UPDATE payment_items SET status = ? WHERE id = ?");
  for (const payment of payments) {
    const next = nextPaymentStatus(payment, contentItems, productDelivered);
    if (next !== payment.status) update.run(next, payment.id);
  }
}
