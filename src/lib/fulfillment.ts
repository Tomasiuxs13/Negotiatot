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
  OnboardingTask,
  OnboardingKind,
  OnboardingStatus,
  OnboardingTemplateStep,
  TaskOwner,
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
  filename: string;
  filePath: string;
  mime: string;
}): number {
  const info = db
    .prepare(
      `INSERT INTO contracts (deal_id, filename, file_path, mime, status)
       VALUES (?, ?, ?, ?, 'parsing')`
    )
    .run(fields.dealId, fields.filename, fields.filePath, fields.mime);
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
  title: string;
  platform?: string | null;
  dueDate?: string | null;
  dueRule?: string | null;
  dueDaysAfterDelivery?: number | null;
}): number {
  const info = db
    .prepare(
      `INSERT INTO content_items (deal_id, title, platform, due_date, due_rule, due_days_after_delivery)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.dealId,
      fields.title,
      fields.platform ?? null,
      fields.dueDate ?? null,
      fields.dueRule ?? null,
      fields.dueDaysAfterDelivery ?? null
    );
  return Number(info.lastInsertRowid);
}

export interface ContentActuals {
  views: number | null;
  clicks: number | null;
  orders: number | null;
  revenue: number | null;
}

/**
 * Records what one deliverable returned, then rolls the deal's totals up from its
 * items. Keeping the deal-level sum in sync means every existing view — pipeline CPM,
 * partner stats, the deal's own Actuals tab — keeps working unchanged.
 */
export function setContentActuals(id: number, actuals: ContentActuals) {
  // Stamping when the reading was taken is what separates a provisional number from
  // one the playbook can be calibrated against.
  db.prepare(
    `UPDATE content_items
     SET actual_views = ?, actual_clicks = ?, actual_orders = ?, actual_revenue = ?,
         actuals_measured_at = CASE WHEN ? IS NULL THEN NULL ELSE date('now') END,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(actuals.views, actuals.clicks, actuals.orders, actuals.revenue, actuals.views, id);

  const item = db.prepare("SELECT deal_id FROM content_items WHERE id = ?").get(id) as
    | { deal_id: number }
    | undefined;
  if (item) recomputeDealActuals(item.deal_id);
}

/** Sums per-item results onto the deal. A column stays null until some item reports it. */
export function recomputeDealActuals(dealId: number) {
  const totals = db
    .prepare(
      `SELECT SUM(actual_views) AS views, SUM(actual_clicks) AS clicks,
              SUM(actual_orders) AS orders, SUM(actual_revenue) AS revenue,
              COUNT(actual_views) AS measured
       FROM content_items WHERE deal_id = ?`
    )
    .get(dealId) as {
    views: number | null;
    clicks: number | null;
    orders: number | null;
    revenue: number | null;
    measured: number;
  };

  if (totals.measured === 0) return;

  db.prepare(
    `UPDATE deals
     SET actual_views = ?, actual_clicks = ?, actual_orders = ?, actual_revenue = ?,
         actuals_logged_at = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    totals.views,
    totals.clicks,
    totals.orders,
    totals.revenue,
    new Date().toISOString(),
    dealId
  );
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
    // Stamp the publication date the first time it goes live — it starts the clock
    // every view count is later judged against.
    if (fields.status === "posted" || fields.status === "verified") {
      sets.push("posted_at = COALESCE(posted_at, date('now'))");
    }
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

export function getPaymentItem(id: number): PaymentItem | undefined {
  return db.prepare("SELECT * FROM payment_items WHERE id = ?").get(id) as
    | PaymentItem
    | undefined;
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
      `INSERT INTO payment_items (deal_id, description, amount, trigger, due_date, linked_content_ids, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.dealId,
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
    // Leaving a settled state must take its timestamp along. An undone approval that
    // kept approved_at exported to accounting as "Ready to approve" with a June
    // settlement date — the row claimed both things at once.
    if (fields.status === "approvable" || fields.status === "pending") {
      sets.push("approved_at = NULL", "paid_at = NULL");
    }
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
  product: string;
  value?: number | null;
  address?: string | null;
}): number {
  const info = db
    .prepare(
      "INSERT INTO shipments (deal_id, product, value, address) VALUES (?, ?, ?, ?)"
    )
    .run(fields.dealId, fields.product, fields.value ?? null, fields.address ?? null);
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

/* ------------------------------------------------------------- onboarding */

/**
 * A deal's checklist: the partner's one-time setup plus anything specific to this
 * collaboration. The partner rows are shared, so a creator who registered last spring
 * shows up already done rather than being asked again.
 */
export function getOnboardingForDeal(dealId: number, partnerId: number | null): OnboardingTask[] {
  if (partnerId == null) {
    return db
      .prepare("SELECT * FROM onboarding_tasks WHERE deal_id = ? ORDER BY position, id")
      .all(dealId) as OnboardingTask[];
  }
  return db
    .prepare(
      `SELECT * FROM onboarding_tasks
       WHERE (partner_id = ? AND deal_id IS NULL) OR deal_id = ?
       ORDER BY deal_id IS NOT NULL, position, id`
    )
    .all(partnerId, dealId) as OnboardingTask[];
}

/** The creator's one-time setup, independent of any campaign. */
export function getPartnerOnboarding(partnerId: number): OnboardingTask[] {
  return db
    .prepare(
      "SELECT * FROM onboarding_tasks WHERE partner_id = ? AND deal_id IS NULL ORDER BY position, id"
    )
    .all(partnerId) as OnboardingTask[];
}

export function getAllOnboardingTasks(): OnboardingTask[] {
  return db.prepare("SELECT * FROM onboarding_tasks").all() as OnboardingTask[];
}

export function createOnboardingTask(fields: {
  partnerId: number;
  dealId: number | null;
  kind: OnboardingKind;
  label: string;
  owner: TaskOwner;
  position?: number;
}): number {
  const info = db
    .prepare(
      `INSERT INTO onboarding_tasks (partner_id, deal_id, kind, label, owner, position)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.partnerId,
      fields.dealId,
      fields.kind,
      fields.label,
      fields.owner,
      fields.position ?? 99
    );
  return Number(info.lastInsertRowid);
}

export function updateOnboardingTask(
  id: number,
  fields: { status?: OnboardingStatus; value?: string | null; label?: string }
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.status !== undefined) {
    sets.push("status = ?", "completed_at = ?");
    params.push(fields.status, fields.status === "done" ? new Date().toISOString().slice(0, 10) : null);
  }
  if (fields.value !== undefined) {
    sets.push("value = ?");
    params.push(fields.value);
  }
  if (fields.label !== undefined) {
    sets.push("label = ?");
    params.push(fields.label);
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE onboarding_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);
}

export function deleteOnboardingTask(id: number) {
  db.prepare("DELETE FROM onboarding_tasks WHERE id = ?").run(id);
}

/**
 * Lays down a deal's checklist. Partner-scoped steps are created only if the creator
 * doesn't already have them — that's what stops a returning partner being asked to
 * register a second time — and deal steps are created once per deal.
 */
export function seedOnboarding(
  dealId: number,
  partnerId: number,
  template: OnboardingTemplateStep[]
): { created: number; inherited: number } {
  const partnerKinds = new Set(getPartnerOnboarding(partnerId).map((t) => t.kind));
  const dealKinds = new Set(
    (
      db
        .prepare("SELECT kind FROM onboarding_tasks WHERE deal_id = ?")
        .all(dealId) as { kind: string }[]
    ).map((t) => t.kind)
  );

  let created = 0;
  let inherited = 0;

  template.forEach((step, i) => {
    const isPartnerScope = step.scope === "partner";
    const seen = isPartnerScope ? partnerKinds : dealKinds;
    if (step.kind !== "custom" && seen.has(step.kind)) {
      if (isPartnerScope) inherited += 1;
      return;
    }
    createOnboardingTask({
      partnerId,
      dealId: isPartnerScope ? null : dealId,
      kind: step.kind,
      label: step.label,
      owner: step.owner,
      position: i,
    });
    created += 1;
  });

  return { created, inherited };
}
