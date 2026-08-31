import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import type { Deal, Message, Stage } from "./types";
import { usageCostUsd } from "./usage-cost";
import { ALL_PLATFORMS, ALL_STAGES, STAGE_LABELS } from "./types";
import {
  DEFAULT_BRAND_PROFILE,
  DEFAULT_GLOBAL_RULES,
  DEFAULT_NEGOTIATION_STYLE,
  DEFAULT_PLATFORM_RULES,
  DEFAULT_UNIT_ECONOMICS,
  type PlatformKey,
} from "./playbook-defaults";
import type { Campaign } from "./campaigns";
import type { Partner, PartnerChannel, PartnerContact, PartnerMessage, PartnerSourceRecord } from "./partners";
import type { Reminder } from "./reminders";
import { normalizeEmail, normalizeProfileUrl } from "./creator-identity";
import type { CreatorImportCandidate, ImportSource } from "./creator-import";
import type { EmailProvider, GmailConnectionSummary, InboxEmail, InboxEmailStatus, InboxMatchKind, OutboundEmail } from "./email-inbox";
import type { FollowUpState } from "./followups";
import { DEFAULT_CATEGORIES, parseCategories } from "./categories";
import { parseRecordLayout, type RecordLayout } from "./record-layout";
import { normalizeQuery, rankBy, SEARCH_MIN_CHARS } from "./search";
import { parseColumns, type PartnerColumnKey } from "./partner-columns";
import type { PartnerHandleRow } from "./api-resolve";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "counterpart.db"));
db.pragma("journal_mode = WAL");
// Deleting a deal or partner relies on ON DELETE CASCADE to clear its children.
// SQLite leaves foreign keys off per connection unless asked, so make it explicit
// rather than trust a default — an orphaned payment row is a silent data bug.
db.pragma("foreign_keys = ON");

/** Keep multi-row operational changes all-or-nothing without exposing the database handle. */
export function inTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}

db.exec(`
CREATE TABLE IF NOT EXISTS deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','instagram','tiktok','facebook')),
  format TEXT,
  stage TEXT NOT NULL DEFAULT 'analyzing' CHECK (stage IN ('lead','contacted','analyzing','offer_sent','negotiating','agreed','completed','declined')),
  round INTEGER NOT NULL DEFAULT 0,
  your_move INTEGER NOT NULL DEFAULT 0,
  first_ask INTEGER,
  current_ask INTEGER,
  current_offer INTEGER,
  agreed_price INTEGER,
  anchor INTEGER,
  target INTEGER,
  walkaway INTEGER,
  breakeven INTEGER,
  avg_views INTEGER,
  engagement_rate REAL,
  status_label TEXT,
  status_tone TEXT NOT NULL DEFAULT 'neutral' CHECK (status_tone IN ('good','warn','neutral')),
  campaign TEXT,
  analysis TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('them','us','copilot')),
  body TEXT NOT NULL,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS playbook (
  platform TEXT PRIMARY KEY,
  rules TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_id INTEGER,
  kind TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  -- Who the spend belongs to. Nullable, and null on every row today: this app is still
  -- single-tenant, and the account/brand hierarchy is not settled. The columns exist
  -- ahead of that decision because usage_log is the one table where the history cannot
  -- be reconstructed later — once a second tenant's rows are interleaved with these,
  -- there is no way to work out retrospectively whose spend was whose.
  account_id INTEGER,
  brand_id INTEGER,
  -- Denormalised at write time, from usage-cost.ts. Prices change and models change;
  -- what a call cost when it ran is a fact about that call, and recomputing it later
  -- from today's price list would quietly restate last quarter's margin.
  cost_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Lightweight migrations for existing databases
{
  // Existing installs predate rule-version tracking. Mark the upgrade moment once so
  // their stored analyses are honestly labelled stale until rerun; fresh analyses land
  // after this timestamp and immediately become current.
  db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(
    "playbook_updated_at",
    JSON.stringify(new Date().toISOString())
  );

  const usageCols = (db.prepare("PRAGMA table_info(usage_log)").all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!usageCols.includes("account_id")) db.exec("ALTER TABLE usage_log ADD COLUMN account_id INTEGER");
  if (!usageCols.includes("brand_id")) db.exec("ALTER TABLE usage_log ADD COLUMN brand_id INTEGER");
  if (!usageCols.includes("cost_cents"))
    db.exec("ALTER TABLE usage_log ADD COLUMN cost_cents INTEGER NOT NULL DEFAULT 0");

  const cols = (db.prepare("PRAGMA table_info(deals)").all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!cols.includes("platforms")) db.exec("ALTER TABLE deals ADD COLUMN platforms TEXT");
  if (!cols.includes("deliverables")) db.exec("ALTER TABLE deals ADD COLUMN deliverables TEXT");
  if (!cols.includes("channel_url")) db.exec("ALTER TABLE deals ADD COLUMN channel_url TEXT");
  if (!cols.includes("actual_views")) db.exec("ALTER TABLE deals ADD COLUMN actual_views INTEGER");
  if (!cols.includes("actual_engagements"))
    db.exec("ALTER TABLE deals ADD COLUMN actual_engagements INTEGER");
  if (!cols.includes("actual_clicks")) db.exec("ALTER TABLE deals ADD COLUMN actual_clicks INTEGER");
  if (!cols.includes("actual_orders")) db.exec("ALTER TABLE deals ADD COLUMN actual_orders INTEGER");
  if (!cols.includes("actual_revenue")) db.exec("ALTER TABLE deals ADD COLUMN actual_revenue INTEGER");
  if (!cols.includes("actuals_logged_at")) db.exec("ALTER TABLE deals ADD COLUMN actuals_logged_at TEXT");
  // Why a deal died, so losses become a signal instead of a gap.
  if (!cols.includes("decline_reason")) db.exec("ALTER TABLE deals ADD COLUMN decline_reason TEXT");
  if (!cols.includes("decline_note")) db.exec("ALTER TABLE deals ADD COLUMN decline_note TEXT");
  if (!cols.includes("declined_at")) db.exec("ALTER TABLE deals ADD COLUMN declined_at TEXT");
  if (!cols.includes("revisit_on")) db.exec("ALTER TABLE deals ADD COLUMN revisit_on TEXT");
  // A CPA paid alongside the fee is part of the deal price, so it lives on the deal.
  if (!cols.includes("commission_type"))
    db.exec("ALTER TABLE deals ADD COLUMN commission_type TEXT");
  if (!cols.includes("commission_value"))
    db.exec("ALTER TABLE deals ADD COLUMN commission_value REAL");
  // The coupon the audience gets — its cost lands on us, so it belongs on the deal.
  if (!cols.includes("discount_type")) db.exec("ALTER TABLE deals ADD COLUMN discount_type TEXT");
  if (!cols.includes("discount_value"))
    db.exec("ALTER TABLE deals ADD COLUMN discount_value REAL");
  // Set when the manager corrects avg_views/engagement by hand: a re-run analysis must
  // not overwrite a human correction with a fresh model estimate.
  if (!cols.includes("audience_locked"))
    db.exec("ALTER TABLE deals ADD COLUMN audience_locked INTEGER NOT NULL DEFAULT 0");
  // When the deal was actually won. Monthly KPIs used updated_at, which every edit
  // bumps — logging actuals on a March deal pulled its whole fee into July's budget.
  if (!cols.includes("agreed_at")) {
    db.exec("ALTER TABLE deals ADD COLUMN agreed_at TEXT");
    // Best available backfill: the last-touched time of already-won deals. Wrong for
    // deals edited after closing, but the honest alternative is NULL, which would
    // silently drop them from every monthly figure.
    db.exec(
      "UPDATE deals SET agreed_at = updated_at WHERE stage IN ('agreed','completed') AND agreed_at IS NULL"
    );
  }
  // Free-text notes on the deal — context only a human knows ("prefers email",
  // "agency negotiates for him"). Fed to the Copilot as background, never as rules.
  if (!cols.includes("notes")) db.exec("ALTER TABLE deals ADD COLUMN notes TEXT");
  // Usage rights, whitelisting and exclusivity, marked at intake so they can shape the
  // price — JSON, parsed by rights.ts. One column, not seven: the shape will evolve.
  if (!cols.includes("rights")) db.exec("ALTER TABLE deals ADD COLUMN rights TEXT");
  // When outreach actually went out. updated_at cannot answer this — it moves on every
  // edit, so a deal touched today would look freshly contacted however long it had been
  // silent. Backfilled from updated_at for rows that predate the column, which is exact
  // for imported deals (created and last-touched at the same moment) and the best
  // available guess for the rest.
  if (!cols.includes("contacted_at")) {
    db.exec("ALTER TABLE deals ADD COLUMN contacted_at TEXT");
    db.exec(
      "UPDATE deals SET contacted_at = COALESCE(updated_at, created_at) WHERE contacted_at IS NULL AND stage NOT IN ('lead')"
    );
  }
  if (!cols.includes("job_status")) db.exec("ALTER TABLE deals ADD COLUMN job_status TEXT");
  if (!cols.includes("job_error")) db.exec("ALTER TABLE deals ADD COLUMN job_error TEXT");
  if (!cols.includes("job_started_at")) db.exec("ALTER TABLE deals ADD COLUMN job_started_at TEXT");
  if (!cols.includes("campaign_id")) db.exec("ALTER TABLE deals ADD COLUMN campaign_id INTEGER");
  if (!cols.includes("partner_id")) db.exec("ALTER TABLE deals ADD COLUMN partner_id INTEGER");
  db.exec(`CREATE TABLE IF NOT EXISTS partners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS partner_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    handle TEXT,
    url TEXT,
    followers INTEGER,
    avg_views INTEGER,
    engagement_rate REAL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  /*
   * Provider evidence is intentionally separate from the partner record. Modash,
   * HypeAuditor and a manager may all describe the same creator differently; keeping
   * the raw source and identity key means we can match it again without pretending the
   * numbers are interchangeable or overwriting a human correction.
   */
  db.exec(`CREATE TABLE IF NOT EXISTS partner_source_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    external_id TEXT,
    profile_url TEXT,
    raw_data TEXT NOT NULL DEFAULT '{}',
    imported_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_partner_source_external ON partner_source_records(source, external_id) WHERE external_id IS NOT NULL"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_partner_source_profile ON partner_source_records(profile_url) WHERE profile_url IS NOT NULL"
  );
  db.exec(`CREATE TABLE IF NOT EXISTS partner_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    label TEXT,
    source TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(partner_id, email)
  )`);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_partner_contacts_email ON partner_contacts(email)"
  );
  db.exec(`CREATE TABLE IF NOT EXISTS creator_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    filename TEXT,
    row_count INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS creator_import_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL REFERENCES creator_import_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    source_record_id TEXT,
    result TEXT NOT NULL,
    partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    raw_data TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // OAuth credentials remain encrypted by gmail.ts. This table contains only opaque
  // cipher text and gives the operational inbox a durable, auditable local home.
  db.exec(`CREATE TABLE IF NOT EXISTS email_connections (
    provider TEXT PRIMARY KEY,
    account_email TEXT NOT NULL,
    encrypted_tokens TEXT NOT NULL,
    scopes TEXT NOT NULL,
    connected_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_sync_at TEXT,
    automation_started_at TEXT,
    last_automatic_sync_at TEXT,
    last_error TEXT
  )`);
  const emailConnectionCols = (db.prepare("PRAGMA table_info(email_connections)").all() as { name: string }[]).map(
    (column) => column.name
  );
  if (!emailConnectionCols.includes("automation_started_at")) {
    db.exec("ALTER TABLE email_connections ADD COLUMN automation_started_at TEXT");
  }
  if (!emailConnectionCols.includes("last_automatic_sync_at")) {
    db.exec("ALTER TABLE email_connections ADD COLUMN last_automatic_sync_at TEXT");
  }
  db.exec(`CREATE TABLE IF NOT EXISTS inbound_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    provider_message_id TEXT NOT NULL,
    provider_thread_id TEXT,
    from_email TEXT,
    from_name TEXT,
    subject TEXT,
    body TEXT NOT NULL,
    received_at TEXT NOT NULL,
    partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    match_kind TEXT NOT NULL CHECK (match_kind IN ('deal','partner_only','unmatched')),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','imported','ignored')),
    imported_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    auto_eligible INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider, provider_message_id)
  )`);
  const inboundEmailCols = (db.prepare("PRAGMA table_info(inbound_emails)").all() as { name: string }[]).map(
    (column) => column.name
  );
  if (!inboundEmailCols.includes("auto_eligible")) {
    db.exec("ALTER TABLE inbound_emails ADD COLUMN auto_eligible INTEGER NOT NULL DEFAULT 0");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_inbound_emails_status ON inbound_emails(status, received_at DESC)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inbound_emails_partner ON inbound_emails(partner_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_inbound_emails_deal ON inbound_emails(deal_id)");
  db.exec(`CREATE TABLE IF NOT EXISTS outbound_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    provider_message_id TEXT NOT NULL,
    provider_thread_id TEXT,
    to_email TEXT,
    subject TEXT,
    body TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    partner_id INTEGER REFERENCES partners(id) ON DELETE SET NULL,
    deal_id INTEGER REFERENCES deals(id) ON DELETE SET NULL,
    match_kind TEXT NOT NULL CHECK (match_kind IN ('deal','partner_only','unmatched')),
    imported_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(provider, provider_message_id)
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_outbound_emails_deal ON outbound_emails(deal_id, sent_at DESC)");
  // Follow-ups are derived from the negotiation thread. This tiny state table stores
  // only an intentional temporary exception — the manager's snooze — tied to the
  // exact outbound message it postpones.
  db.exec(`CREATE TABLE IF NOT EXISTS deal_followup_states (
    deal_id INTEGER PRIMARY KEY REFERENCES deals(id) ON DELETE CASCADE,
    anchor_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL,
    anchor_at TEXT NOT NULL,
    snoozed_until TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  if (!cols.includes("deal_type")) db.exec("ALTER TABLE deals ADD COLUMN deal_type TEXT");
  db.exec(`CREATE TABLE IF NOT EXISTS contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    partner_id INTEGER,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime TEXT NOT NULL,
    parsed_terms TEXT,
    status TEXT NOT NULL DEFAULT 'uploaded',
    parse_error TEXT,
    signed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS content_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    partner_id INTEGER,
    title TEXT NOT NULL,
    platform TEXT,
    due_date TEXT,
    due_date_anchor TEXT,
    due_date_mode TEXT,
    due_rule TEXT,
    due_days_after_delivery INTEGER,
    status TEXT NOT NULL DEFAULT 'planned',
    posted_url TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  /*
   * Setup that makes a collaboration trackable, at the level it actually belongs to.
   *
   * Registering on the affiliate platform happens once per creator, not once per
   * campaign — so a task with deal_id NULL is partner-scoped and carries across every
   * future deal. A coupon code is campaign-specific, so it hangs off the deal. This is
   * the one place a partner genuinely owns a record directly rather than through a
   * deal, which is why partner_id is required and deal_id is not.
   */
  db.exec(`CREATE TABLE IF NOT EXISTS onboarding_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    owner TEXT NOT NULL DEFAULT 'us',
    value TEXT,
    status TEXT NOT NULL DEFAULT 'todo',
    position INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  /*
   * The manager's own follow-ups — "they said ask again in Q4", "chase the invoice".
   * Distinct from onboarding_tasks (a templated checklist the app generates) and from
   * attention items (derived from data): a reminder is something a human promised to
   * do at a date only they know. Attached to a partner or a deal so it deep-links and
   * dies with its subject.
   */
  db.exec(`CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    due_on TEXT NOT NULL,
    partner_id INTEGER REFERENCES partners(id) ON DELETE CASCADE,
    deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
    done_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // The first shape of this table keyed everything to a deal. It never shipped, so
  // rebuilding it empty is safe and simpler than migrating rows that don't exist.
  {
    const cols = (db.prepare("PRAGMA table_info(onboarding_tasks)").all() as { name: string }[])
      .map((c) => c.name);
    if (!cols.includes("partner_id")) {
      db.exec("DROP TABLE onboarding_tasks");
      db.exec(`CREATE TABLE onboarding_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
        deal_id INTEGER REFERENCES deals(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        owner TEXT NOT NULL DEFAULT 'us',
        value TEXT,
        status TEXT NOT NULL DEFAULT 'todo',
        position INTEGER NOT NULL DEFAULT 0,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS payment_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    partner_id INTEGER,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL,
    trigger TEXT NOT NULL DEFAULT 'on_verification',
    due_date TEXT,
    linked_content_ids TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    approved_at TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    partner_id INTEGER,
    product TEXT NOT NULL,
    value INTEGER,
    address TEXT,
    carrier TEXT,
    tracking TEXT,
    status TEXT NOT NULL DEFAULT 'to_prepare',
    shipped_at TEXT,
    delivered_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // The draft review loop: what the creator submitted, which revision round it is,
  // and the approved version frozen at approval — "you approved this" needs a record.
  {
    const ccols = (db.prepare("PRAGMA table_info(content_items)").all() as { name: string }[])
      .map((c) => c.name);
    const add = (col: string, ddl: string) => {
      if (ccols.length > 0 && !ccols.includes(col))
        db.exec(`ALTER TABLE content_items ADD COLUMN ${ddl}`);
    };
    add("draft_url", "draft_url TEXT");
    add("draft_submitted_at", "draft_submitted_at TEXT");
    add("revision_round", "revision_round INTEGER NOT NULL DEFAULT 0");
    add("change_request", "change_request TEXT");
    add("approved_url", "approved_url TEXT");
    add("approved_at", "approved_at TEXT");
    // The integration check: what was said, when, and how it graded against the brief.
    // The transcript is kept because the check's findings are only auditable against it
    // — "the brand name was never said" has to be arguable, not asserted.
    add("video_path", "video_path TEXT");
    add("transcript", "transcript TEXT");
    add("transcript_chunks", "transcript_chunks TEXT");
    add("check_result", "check_result TEXT");
    add("checked_at", "checked_at TEXT");
    // Conditional contract dates keep their fixed anchor after due_date resolves from
    // product delivery. Old rows are inferred safely by fulfillment.ts.
    add("due_date_anchor", "due_date_anchor TEXT");
    add("due_date_mode", "due_date_mode TEXT");
    add("due_date_override", "due_date_override TEXT");
    add("requested_due_date", "requested_due_date TEXT");
    add("due_date_request_reason", "due_date_request_reason TEXT");
    add("due_date_requested_at", "due_date_requested_at TEXT");
  }
  // The partner portal is addressed by an unguessable per-partner token, never an id.
  {
    const pcols = (db.prepare("PRAGMA table_info(partners)").all() as { name: string }[])
      .map((c) => c.name);
    const padd = (col: string) => {
      if (pcols.length > 0 && !pcols.includes(col))
        db.exec(`ALTER TABLE partners ADD COLUMN ${col} TEXT`);
    };
    padd("share_token");
    // Contract party details, filled by the creator through their portal.
    padd("legal_name");
    padd("company_name");
    padd("tax_id");
    padd("legal_address");
    // What the creator's channel is about, from the managed list in Settings. Tags stay
    // free-form; this one is constrained so Benchmarks can group on it.
    padd("category");
  }
  // Generated contracts stay editable text until marked signed; the signed original
  // then arrives through the existing upload-and-parse flow.
  db.exec(`CREATE TABLE IF NOT EXISTS contract_drafts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // "50% after half the videos": how many linked content items must be verified before
  // an on_verification payment unlocks. NULL means all of them.
  {
    const payCols = (db.prepare("PRAGMA table_info(payment_items)").all() as { name: string }[])
      .map((c) => c.name);
    if (payCols.length > 0 && !payCols.includes("required_verified"))
      db.exec("ALTER TABLE payment_items ADD COLUMN required_verified INTEGER");
  }
  // The creator fills their own delivery details through a tokenised public form —
  // addresses dictated over chat arrive wrong, and the manager retypes them anyway.
  {
    const shipCols = (db.prepare("PRAGMA table_info(shipments)").all() as { name: string }[])
      .map((c) => c.name);
    if (!shipCols.includes("share_token"))
      db.exec("ALTER TABLE shipments ADD COLUMN share_token TEXT");
    if (!shipCols.includes("recipient")) db.exec("ALTER TABLE shipments ADD COLUMN recipient TEXT");
    if (!shipCols.includes("phone")) db.exec("ALTER TABLE shipments ADD COLUMN phone TEXT");
    if (!shipCols.includes("address_submitted_at"))
      db.exec("ALTER TABLE shipments ADD COLUMN address_submitted_at TEXT");
    if (!shipCols.includes("tracking_exception")) {
      try {
        db.exec("ALTER TABLE shipments ADD COLUMN tracking_exception TEXT");
      } catch {
        /* added concurrently */
      }
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    objective TEXT,
    primary_kpi TEXT,
    kpi_target REAL,
    overrides TEXT NOT NULL DEFAULT '{}',
    budget INTEGER,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
  // The brand's own creator brief — an asset the company already has, attached once
  // per campaign and delivered to creators through their portal.
  {
    const ccols2 = (db.prepare("PRAGMA table_info(campaigns)").all() as { name: string }[])
      .map((c) => c.name);
    // Two build workers can race this block; a duplicate-column error just means the
    // other worker won, so each ALTER stands alone and swallows that specific failure.
    for (const col of ["brief_path", "brief_filename", "brief_mime", "brief_requirements"]) {
      if (ccols2.length > 0 && !ccols2.includes(col)) {
        try {
          db.exec(`ALTER TABLE campaigns ADD COLUMN ${col} TEXT`);
        } catch {
          /* added concurrently */
        }
      }
    }
    for (const [col, type] of [
      ["objective", "TEXT"],
      ["primary_kpi", "TEXT"],
      ["kpi_target", "REAL"],
    ] as const) {
      if (ccols2.length > 0 && !ccols2.includes(col)) {
        try {
          db.exec(`ALTER TABLE campaigns ADD COLUMN ${col} ${type}`);
        } catch {
          /* added concurrently */
        }
      }
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deal_id INTEGER,
    kind TEXT NOT NULL,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

/**
 * A collaboration item belongs to its deal, and reaches the partner through it. These
 * columns duplicated that link, were never read, and silently went stale whenever a
 * deal changed hands — so the schema now enforces the single path.
 */
for (const table of ["content_items", "payment_items", "shipments", "contracts"]) {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name
  );
  if (cols.includes("partner_id")) {
    db.exec(`ALTER TABLE ${table} DROP COLUMN partner_id`);
  }
}

// Per-deliverable results. A bundle deal spans platforms, so deal-level totals can't
// say which platform delivered what — these can.
{
  const cols = (db.prepare("PRAGMA table_info(content_items)").all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!cols.includes("actual_views"))
    db.exec("ALTER TABLE content_items ADD COLUMN actual_views INTEGER");
  if (!cols.includes("actual_engagements"))
    db.exec("ALTER TABLE content_items ADD COLUMN actual_engagements INTEGER");
  if (!cols.includes("actual_clicks"))
    db.exec("ALTER TABLE content_items ADD COLUMN actual_clicks INTEGER");
  if (!cols.includes("actual_orders"))
    db.exec("ALTER TABLE content_items ADD COLUMN actual_orders INTEGER");
  if (!cols.includes("actual_revenue"))
    db.exec("ALTER TABLE content_items ADD COLUMN actual_revenue INTEGER");
  // A view count without an age can't be compared to another one.
  if (!cols.includes("posted_at")) db.exec("ALTER TABLE content_items ADD COLUMN posted_at TEXT");
  if (!cols.includes("actuals_measured_at"))
    db.exec("ALTER TABLE content_items ADD COLUMN actuals_measured_at TEXT");

  // Items that went live before posting was timestamped: the last edit is the closest
  // honest estimate of when they were published.
  db.exec(
    `UPDATE content_items SET posted_at = date(updated_at)
     WHERE posted_at IS NULL AND status IN ('posted', 'verified')`
  );
}

/**
 * SQLite can't ALTER a CHECK constraint, so widening one means rebuilding the table
 * from its own stored DDL with the constraint swapped. Driven by the ALL_* constants,
 * so a future stage or platform migrates an existing database on next boot without
 * another bespoke migration.
 */
function widenCheckConstraint(column: "stage" | "platform", values: readonly string[]) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'deals'")
    .get() as { sql: string } | undefined;
  if (!row) return;

  const wanted = `CHECK (${column} IN (${values.map((v) => `'${v}'`).join(",")}))`;
  if (row.sql.includes(wanted)) return;

  const rebuilt = row.sql
    .replace(new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\([^)]*\\)\\s*\\)`, "i"), wanted)
    .replace(/CREATE TABLE\s+"?deals"?/i, "CREATE TABLE deals_migrate");

  // The pragma is process-wide state: restoring it in a finally block means a failed
  // rebuild throws with FK enforcement back on, instead of silently orphaning every
  // child row deleted for the rest of the process's life.
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(rebuilt);
      db.exec("INSERT INTO deals_migrate SELECT * FROM deals");
      db.exec("DROP TABLE deals");
      db.exec("ALTER TABLE deals_migrate RENAME TO deals");
    })();
  } finally {
    db.pragma("foreign_keys = ON");
  }
}
widenCheckConstraint("stage", ALL_STAGES);
widenCheckConstraint("platform", ALL_PLATFORMS);

/**
 * One-time backfill: deals used to store the creator as a plain string. Give every
 * unlinked deal a real partner record (deduped by name) and seed its channels from
 * whatever the deal already knows.
 */
function backfillPartners() {
  const orphans = db
    .prepare("SELECT * FROM deals WHERE partner_id IS NULL ORDER BY id")
    .all() as Deal[];
  if (orphans.length === 0) return;

  const findByName = db.prepare("SELECT id FROM partners WHERE name = ? COLLATE NOCASE");
  const insertPartner = db.prepare("INSERT INTO partners (name) VALUES (?)");
  const linkDeal = db.prepare("UPDATE deals SET partner_id = ? WHERE id = ?");
  const findChannel = db.prepare(
    "SELECT id FROM partner_channels WHERE partner_id = ? AND platform = ?"
  );
  const insertChannel = db.prepare(
    `INSERT INTO partner_channels (partner_id, platform, url, avg_views, engagement_rate)
     VALUES (?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    for (const deal of orphans) {
      const existing = findByName.get(deal.creator) as { id: number } | undefined;
      const partnerId =
        existing?.id ?? Number(insertPartner.run(deal.creator).lastInsertRowid);
      linkDeal.run(partnerId, deal.id);

      let platforms: string[] = [deal.platform];
      if (deal.platforms) {
        try {
          const parsed = JSON.parse(deal.platforms) as string[];
          if (parsed.length > 0) platforms = parsed;
        } catch {
          /* keep the primary platform */
        }
      }
      for (const platform of platforms) {
        if (findChannel.get(partnerId, platform)) continue;
        insertChannel.run(
          partnerId,
          platform,
          platform === deal.platform ? deal.channel_url : null,
          platform === deal.platform ? deal.avg_views : null,
          platform === deal.platform ? deal.engagement_rate : null
        );
      }
    }
  })();
}

/** Jobs interrupted by a server restart would otherwise spin forever — fail them. */
function failStaleJobs() {
  db.prepare(
    `UPDATE deals SET job_status = NULL, job_started_at = NULL,
       job_error = 'The job was interrupted (server restarted?). Run it again.'
     WHERE job_status IS NOT NULL AND job_started_at < datetime('now', '-15 minutes')`
  ).run();
}

function seedIfEmpty() {
  // Seeding must be a strict one-time event, not "run whenever deals is empty" —
  // otherwise deleting your deals to start fresh silently restores the demo data on
  // the next boot. A persistent marker records that seeding has happened.
  if (getSetting<boolean>("seeded")) return;

  // Existing installs predate the marker: if there's already any data, they were seeded
  // (or built by hand) long ago, so record that and never seed over their content.
  const existing =
    (db.prepare("SELECT COUNT(*) AS n FROM deals").get() as { n: number }).n +
    (db.prepare("SELECT COUNT(*) AS n FROM partners").get() as { n: number }).n +
    (db.prepare("SELECT COUNT(*) AS n FROM playbook").get() as { n: number }).n;
  if (existing > 0) {
    setSetting("seeded", true);
    return;
  }

  const insertDeal = db.prepare(`
    INSERT INTO deals (creator, platform, format, stage, round, your_move,
      first_ask, current_ask, current_offer, agreed_price,
      anchor, target, walkaway, breakeven, avg_views, engagement_rate,
      status_label, status_tone, campaign, analysis)
    VALUES (@creator, @platform, @format, @stage, @round, @your_move,
      @first_ask, @current_ask, @current_offer, @agreed_price,
      @anchor, @target, @walkaway, @breakeven, @avg_views, @engagement_rate,
      @status_label, @status_tone, @campaign, @analysis)
  `);

  const martaAnalysis = JSON.stringify({
    verdict: "negotiate",
    verdictSummary:
      "Their $3,500 ask is 30% above your walk-away, but the channel's fundamentals support $2,200–2,700. Engagement and audience quality pass your Playbook; price is the only real gap. Recommended path: anchor at $1,950 and trade scope before price.",
    metrics: [
      { label: "Avg views · last 30 videos", value: "96.4K", note: "▼ 18% over 90 days", tone: "warn" },
      { label: "Engagement rate", value: "4.7%", note: "✓ min 3.5%", tone: "good" },
      { label: "CPM at their ask", value: "$36.30", note: "✗ max $28.00", tone: "crit" },
      { label: "DACH audience", value: "58%", note: "~ required ≥ 60%", tone: "warn" },
    ],
    redFlags: [
      {
        title: "View trend declining",
        detail:
          "Average views fell 18% over the last 90 days. Fair value is computed on the recent 30 videos, not lifetime stats — their rate card likely uses the older, higher number.",
        severity: "warn",
      },
      {
        title: "Audience geo slightly off target",
        detail:
          "58% DACH vs. your 60% floor. Borderline — priced in by valuing only in-geo impressions (effective views: 55.9K for geo-strict math).",
        severity: "warn",
      },
      {
        title: "High sponsorship density",
        detail:
          "6 of the last 12 videos were sponsored. Sponsored videos average 22% lower engagement than organic ones — expect the lower bound of predicted views.",
        severity: "warn",
      },
      {
        title: "Audience credibility passes",
        detail: "6% suspicious followers (your max: 15%). No unnatural growth spikes in the last 12 months.",
        severity: "good",
      },
    ],
    numbers: [
      {
        label: "Target",
        value: 2250,
        explanation:
          "96.4K avg views × your target CPM of $23.30 (niche benchmark $26, discounted 10% for the view-trend decline and geo shortfall).",
      },
      {
        label: "Walk-away",
        value: 2700,
        explanation:
          "Your Playbook max CPM $28.00 × 96.4K avg views. Above this the deal fails your rules regardless of how the conversation goes.",
      },
      {
        label: "Breakeven",
        value: 3050,
        explanation:
          "Predicted 1,157 clicks (1.2% CTR) × 3.0% conversion × $120 AOV × 60% margin × 1.35 repeat factor. Above breakeven the deal loses money even if it performs to forecast.",
      },
      {
        label: "Anchor",
        value: 1950,
        explanation:
          "13% below target, per your Playbook anchoring rule — low enough to move the midpoint, defensible with the view-trend data so it doesn't read as an insult.",
      },
    ],
  });

  const deals = [
    {
      creator: "FitmitLena", platform: "instagram", format: "reel + story", stage: "analyzing",
      round: 0, your_move: 0, first_ask: null, current_ask: null, current_offer: null, agreed_price: null,
      anchor: null, target: null, walkaway: null, breakeven: null, avg_views: null, engagement_rate: null,
      status_label: "Parsing report", status_tone: "neutral", campaign: "Q3 DACH launch", analysis: null,
    },
    {
      creator: "MobileMax", platform: "tiktok", format: "dedicated video", stage: "analyzing",
      round: 0, your_move: 0, first_ask: 1200, current_ask: 1200, current_offer: null, agreed_price: null,
      anchor: null, target: 950, walkaway: null, breakeven: null, avg_views: 84000, engagement_rate: 6.1,
      status_label: "Reviewing metrics", status_tone: "neutral", campaign: "Q3 DACH launch", analysis: null,
    },
    {
      creator: "KüchenKompass", platform: "youtube", format: "integration", stage: "offer_sent",
      round: 1, your_move: 0, first_ask: 2900, current_ask: 2900, current_offer: 2400, agreed_price: null,
      anchor: 2400, target: 2600, walkaway: 2950, breakeven: 3200, avg_views: 112000, engagement_rate: 3.9,
      status_label: "Waiting 2 days", status_tone: "warn", campaign: "Q3 DACH launch", analysis: null,
    },
    {
      creator: "TechWithMarta", platform: "youtube", format: "integration", stage: "negotiating",
      round: 2, your_move: 1, first_ask: 3500, current_ask: 3100, current_offer: 1950, agreed_price: null,
      anchor: 1950, target: 2250, walkaway: 2700, breakeven: 3050, avg_views: 96400, engagement_rate: 4.7,
      status_label: "Round 2 · your move", status_tone: "warn", campaign: "Q3 DACH launch", analysis: martaAnalysis,
    },
    {
      creator: "AlltagsAlex", platform: "instagram", format: "reel", stage: "negotiating",
      round: 3, your_move: 0, first_ask: 2800, current_ask: 2650, current_offer: 2500, agreed_price: null,
      anchor: 2200, target: 2500, walkaway: 2750, breakeven: 2900, avg_views: 132000, engagement_rate: 5.2,
      status_label: "Close to agreed", status_tone: "good", campaign: "Always-on ambassadors", analysis: null,
    },
    {
      creator: "DataDives", platform: "instagram", format: "reel + story", stage: "agreed",
      round: 2, your_move: 0, first_ask: 1900, current_ask: 1500, current_offer: 1500, agreed_price: 1500,
      anchor: 1300, target: 1500, walkaway: 1750, breakeven: 1950, avg_views: 70000, engagement_rate: 4.4,
      status_label: "Under ceiling", status_tone: "good", campaign: "Always-on ambassadors", analysis: null,
    },
  ];

  const insertAll = db.transaction(() => {
    for (const d of deals) insertDeal.run(d);

    const marta = (db.prepare("SELECT id FROM deals WHERE creator = 'TechWithMarta'").get() as { id: number }).id;
    const insertMsg = db.prepare(
      "INSERT INTO messages (deal_id, sender, body, meta) VALUES (?, ?, ?, ?)"
    );
    insertMsg.run(
      marta, "them",
      "Hi! Thanks for reaching out — I love the product. My rate for a dedicated integration (60–90s) is $3,500 including one round of revisions. Happy to jump on a call!",
      null
    );
    insertMsg.run(
      marta, "us",
      "Thanks Marta! We ran the numbers on recent performance — for a 60–90s integration our budget model works out to $1,950. That's based on your last-30-video average views, and we'd love to make this the first of several collaborations if it performs. Would that work as a starting point?",
      JSON.stringify({ offer: 1950 })
    );
    insertMsg.run(
      marta, "them",
      "I appreciate the transparency! $1,950 is quite far from my rate though. Considering the production quality I put in, the lowest I could do is $3,100.",
      JSON.stringify({ counter: 3100 })
    );
    insertMsg.run(
      marta, "copilot",
      "Counter $2,300 and trade usage rights",
      JSON.stringify({
        round: 2,
        headline: "Counter $2,300 and trade usage rights",
        proposedOffer: 2300,
        pills: [
          { label: "Counter: $2,300", tone: "good" },
          { label: "+ ask: 60-day ad usage rights", tone: "plain" },
          { label: "Headroom left: $400", tone: "plain" },
        ],
        reasoning: [
          "$2,300 = $23.90 CPM on her real average views — inside your $28 max, just above your $2,250 target.",
          "She moved $400 (3,500 → 3,100); moving $350 mirrors her concession size and signals your ceiling is near.",
          "Asking for usage rights makes your raise a trade, not a cave — she can accept the price by giving scope.",
          "Expected counter: $2,700–2,900. Plan: hold $2,300–2,500, offer whitelisting or a 2-video bundle instead of more cash.",
        ],
        drafts: {
          balanced:
            "Totally understand, Marta — your production quality shows. Here's where we can realistically land: $2,300, and to make it worth the gap we'd include 60-day usage rights so we can run the segment as ads (that's real added value on our side, and extra reach for you). If the video performs against our benchmarks, we'd lock a multi-video deal at a higher rate for the next round. Deal?",
          warm:
            "Marta, we really do want to make this work — your content is exactly the fit we look for. We can stretch to $2,300 if we can also use the segment in our ads for 60 days. And honestly, our favorite creators are the ones we work with repeatedly: if this one performs, the next deal starts from a better number. Can we shake on that?",
          firm:
            "Appreciate you moving, Marta. To be transparent: our model prices your channel on the last-30-video average (96K views), which puts a 60–90s integration at $2,300 — that's already at the top of our range. We can do $2,300 with 60-day usage rights included. If that doesn't work for this quarter, we'd genuinely like to revisit when the timing is better.",
        },
      })
    );

    const insertPlaybook = db.prepare("INSERT INTO playbook (platform, rules) VALUES (?, ?)");
    insertPlaybook.run("youtube", JSON.stringify({
      minIntegrations: 1,
      maxCpmIntegration: 28, maxCpmShort: 12, targetCpc: 1.2,
      minAvgViews: 25000, minEngagementRate: 3.5, maxFakeFollowers: 15,
      minGeoShare: 60, geoLabel: "DACH", maxPerDeal: 6000, monthlyCap: 25000,
    }));
    insertPlaybook.run("instagram", JSON.stringify({
      minIntegrations: 2,
      maxCpmIntegration: 18, maxCpmShort: 8, targetCpc: 1.0,
      minAvgViews: 15000, minEngagementRate: 3.0, maxFakeFollowers: 20,
      minGeoShare: 60, geoLabel: "DACH", maxPerDeal: 4000, monthlyCap: 25000,
    }));
    insertPlaybook.run("tiktok", JSON.stringify({
      minIntegrations: 3,
      maxCpmIntegration: 10, maxCpmShort: 6, targetCpc: 0.8,
      minAvgViews: 30000, minEngagementRate: 4.0, maxFakeFollowers: 20,
      minGeoShare: 50, geoLabel: "DACH", maxPerDeal: 3000, monthlyCap: 25000,
    }));

    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("unit_economics", JSON.stringify({
      aov: 120, conversionRate: 3.0, grossMargin: 60, repeatFactor: 1.35,
      commissionPercent: 0, commissionPerOrder: 0, discountPercent: 0, discountFixed: 0,
      productCost: 0, minPaidFee: 100,
    }));
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("negotiation_style", JSON.stringify({
      style: "balanced", anchorBelowTargetPct: [12, 15], warnAtWalkawayPct: 90, maxStepPct: 10,
      concessionLadder: [
        "Add smaller deliverable (story / short) instead of raising price",
        "Trade usage rights (60 d) for meeting their number",
        "Multi-video bundle at −12–15% per video",
        "Performance bonus up to $300",
        "Raise price — steps ≤ 10%, never past walk-away",
      ],
      commissionTiers: ["0: 20", "25: 30", "50: 40"],
      nonNegotiables: ["Draft approval before publish", "Net-30 payment", "Trackable link + promo code"],
    }));
  });
  insertAll();
  setSetting("seeded", true);
}
seedIfEmpty();
// Runs after seeding so demo deals get partners too; no-ops once every deal is linked.
backfillPartners();

/**
 * Target market and monthly budget used to live on each platform, which let them
 * disagree — and only YouTube's cap was ever read, so editing the others did nothing.
 * Lift them to one global set, preferring YouTube's values since those were the ones
 * actually in force.
 */
function liftGlobalRules() {
  if (getSetting("global_rules")) return;

  const platforms = ["youtube", "instagram", "tiktok"] as const;
  const stored = platforms.map((p) => {
    const row = db.prepare("SELECT rules FROM playbook WHERE platform = ?").get(p) as
      | { rules: string }
      | undefined;
    return { platform: p, rules: row ? (JSON.parse(row.rules) as Record<string, unknown>) : null };
  });

  const inForce = stored.find((s) => s.rules)?.rules ?? {};
  setSetting("global_rules", {
    ...DEFAULT_GLOBAL_RULES,
    ...(inForce.geoLabel !== undefined ? { geoLabel: inForce.geoLabel } : {}),
    ...(inForce.minGeoShare !== undefined ? { minGeoShare: inForce.minGeoShare } : {}),
    ...(inForce.monthlyCap !== undefined ? { monthlyCap: inForce.monthlyCap } : {}),
  });

  // Drop the now-global keys so the per-platform editor stops showing them.
  for (const { platform, rules } of stored) {
    if (!rules) continue;
    delete rules.geoLabel;
    delete rules.minGeoShare;
    delete rules.monthlyCap;
    delete rules.targetCpc; // never read anywhere, and unanswerable for most managers
    setPlaybook(platform, rules);
  }
}
liftGlobalRules();

/**
 * "conversionRate" never said what it converted from, so the model treated it as
 * click-to-order and invented a click-through rate to reach it. Split into two named
 * rates and carry the old value onto the one it actually meant.
 */
function nameTheConversionRates() {
  const econ = getSetting<Record<string, number>>("unit_economics");
  if (!econ || econ.conversionRate === undefined) return;
  const { conversionRate, ...rest } = econ;
  setSetting("unit_economics", {
    ...rest,
    orderConversion: rest.orderConversion ?? conversionRate,
    linkCtr: rest.linkCtr ?? DEFAULT_UNIT_ECONOMICS.linkCtr,
  });
}
nameTheConversionRates();

export function getDeals(): Deal[] {
  failStaleJobs();
  return db.prepare("SELECT * FROM deals ORDER BY updated_at DESC").all() as Deal[];
}

export function getDeal(id: number): Deal | undefined {
  failStaleJobs();
  return db.prepare("SELECT * FROM deals WHERE id = ?").get(id) as Deal | undefined;
}

export function getPartners(includeArchived = false): Partner[] {
  return db
    .prepare(
      `SELECT * FROM partners ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY name COLLATE NOCASE`
    )
    .all() as Partner[];
}

/**
 * The managed creator categories. Never edited means the starter list, not an empty one:
 * an empty picker at intake only teaches the manager to skip the field.
 */
export function getCreatorCategories(): string[] {
  const stored = getSetting<unknown>("creator_categories");
  return stored == null ? DEFAULT_CATEGORIES : parseCategories(stored);
}

/**
 * Every human message exchanged with a creator, across all of their deals, newest first.
 *
 * Deal-scoped `getMessages` cannot answer "what have we actually said to this person",
 * which is the question you have while negotiating with them. Copilot output is excluded:
 * it was never sent to anybody.
 */
export function getPartnerCommunication(partnerId: number): PartnerMessage[] {
  return db
    .prepare(
      `SELECT m.*, d.creator AS deal_creator, d.campaign AS deal_campaign, d.stage AS deal_stage,
              d.deliverables AS deal_deliverables, d.format AS deal_format
         FROM messages m
         JOIN deals d ON d.id = m.deal_id
        WHERE d.partner_id = ? AND m.sender IN ('us', 'them')
        ORDER BY m.created_at DESC, m.id DESC`
    )
    .all(partnerId) as PartnerMessage[];
}

export interface PartnerIdentity {
  email: string | null;
  channels: { platform: string; handle: string }[];
}

/**
 * How every creator can be recognised: their email and their handles, keyed by partner.
 *
 * The board needs this in one query — 338 partners means 338 round trips otherwise — and
 * needs it at all because a deal only stores a name, which for an imported creator can
 * be "Mo" while the recognisable thing lives on the channel.
 */
export function getPartnerIdentities(): Map<number, PartnerIdentity> {
  const identities = new Map<number, PartnerIdentity>();
  for (const partner of db.prepare("SELECT id, email FROM partners").all() as {
    id: number;
    email: string | null;
  }[]) {
    identities.set(partner.id, { email: partner.email, channels: [] });
  }
  const channels = db
    .prepare(
      "SELECT partner_id, platform, handle FROM partner_channels WHERE handle IS NOT NULL AND TRIM(handle) != ''"
    )
    .all() as { partner_id: number; platform: string; handle: string }[];
  for (const channel of channels) {
    const identity = identities.get(channel.partner_id);
    if (identity) identity.channels.push({ platform: channel.platform, handle: channel.handle });
  }
  return identities;
}

export interface SearchHit {
  kind: "partner" | "deal";
  id: number;
  title: string;
  /** What tells this row apart from the others with the same name. */
  detail: string;
  href: string;
}

/**
 * One search across the records a manager actually navigates to.
 *
 * Creators and deals share names — there are 248 partners and 247 deals here, mostly the
 * same people — so both are returned and each row says which it is and where it stands.
 * Ranking happens in JS (see search.ts) because SQL LIKE cannot tell "Joe Holland" from
 * "a deal whose deliverables mention joe".
 */
export function searchRecords(query: string, limit = 5): SearchHit[] {
  const needle = normalizeQuery(query);
  if (needle.length < SEARCH_MIN_CHARS) return [];
  const like = `%${needle.replace(/[%_]/g, "")}%`;

  const partners = db
    .prepare(
      `SELECT DISTINCT p.id, p.name, p.email, p.category
         FROM partners p
         LEFT JOIN partner_channels c ON c.partner_id = p.id
        WHERE p.archived = 0
          AND (lower(p.name) LIKE ? OR lower(COALESCE(p.email, '')) LIKE ?
               OR lower(COALESCE(p.category, '')) LIKE ? OR lower(COALESCE(c.handle, '')) LIKE ?)
        ORDER BY p.updated_at DESC
        LIMIT 40`
    )
    .all(like, like, like, like) as {
    id: number;
    name: string;
    email: string | null;
    category: string | null;
  }[];

  const deals = db
    .prepare(
      `SELECT id, creator, stage, deliverables, campaign
         FROM deals
        WHERE lower(creator) LIKE ? OR lower(COALESCE(deliverables, '')) LIKE ?
           OR lower(COALESCE(campaign, '')) LIKE ?
        ORDER BY updated_at DESC
        LIMIT 40`
    )
    .all(like, like, like) as {
    id: number;
    creator: string;
    stage: Stage;
    deliverables: string | null;
    campaign: string | null;
  }[];

  const partnerHits: SearchHit[] = rankBy(needle, partners, (p) => [p.name, p.email, p.category])
    .slice(0, limit)
    .map((p) => ({
      kind: "partner" as const,
      id: p.id,
      title: p.name,
      detail: [p.category, p.email].filter(Boolean).join(" · ") || "Creator",
      href: `/partners/${p.id}`,
    }));

  const dealHits: SearchHit[] = rankBy(needle, deals, (d) => [d.creator, d.deliverables, d.campaign])
    .slice(0, limit)
    .map((d) => ({
      kind: "deal" as const,
      id: d.id,
      title: d.creator,
      detail: [STAGE_LABELS[d.stage], d.campaign, d.deliverables].filter(Boolean).join(" · "),
      href: `/deals/${d.id}`,
    }));

  return [...partnerHits, ...dealHits];
}

/**
 * Every creator with the handles they can be addressed by, for the partner API.
 *
 * Archived partners are included: a bulk categorisation is data maintenance, and hiding
 * half the book from it would leave rows that can never be fixed through the API.
 */
export function getPartnersWithHandles(): PartnerHandleRow[] {
  const partners = db
    .prepare("SELECT id, name, category FROM partners ORDER BY id")
    .all() as { id: number; name: string; category: string | null }[];
  const byId = new Map<number, PartnerHandleRow>(
    partners.map((p) => [p.id, { id: p.id, name: p.name, category: p.category, handles: [] }])
  );
  const channels = db
    .prepare(
      "SELECT partner_id, handle FROM partner_channels WHERE handle IS NOT NULL AND TRIM(handle) != ''"
    )
    .all() as { partner_id: number; handle: string }[];
  for (const channel of channels) byId.get(channel.partner_id)?.handles.push(channel.handle);
  return [...byId.values()];
}

/** Which columns the Partners table shows. See partner-columns.ts. */
export function getPartnerColumns(): PartnerColumnKey[] {
  return parseColumns(getSetting<unknown>("partner_columns"));
}

/** How record pages arrange themselves. See record-layout.ts. */
export function getRecordLayout(): RecordLayout {
  return parseRecordLayout(getSetting<unknown>("record_layout"));
}

export function getPartner(id: number): Partner | undefined {
  return db.prepare("SELECT * FROM partners WHERE id = ?").get(id) as Partner | undefined;
}

export function findPartnerByName(name: string): Partner | undefined {
  return db.prepare("SELECT * FROM partners WHERE name = ? COLLATE NOCASE").get(name) as
    | Partner
    | undefined;
}

/** Match email against the primary contact first, then agency/secondary contacts. */
export function findPartnerByEmail(email: string): Partner | undefined {
  const normalized = normalizeEmail(email);
  if (!normalized) return undefined;
  const primary = db
    .prepare("SELECT * FROM partners WHERE lower(email) = ? LIMIT 1")
    .get(normalized) as Partner | undefined;
  if (primary) return primary;
  return db
    .prepare(
      `SELECT p.* FROM partners p
       JOIN partner_contacts c ON c.partner_id = p.id
       WHERE c.email = ? LIMIT 1`
    )
    .get(normalized) as Partner | undefined;
}

/** A profile URL is a stronger identity key than a creator name. */
export function findPartnerByProfileUrl(profileUrl: string): Partner | undefined {
  const normalized = normalizeProfileUrl(profileUrl);
  if (!normalized) return undefined;
  const sourceMatch = db
    .prepare(
      `SELECT p.* FROM partners p
       JOIN partner_source_records s ON s.partner_id = p.id
       WHERE s.profile_url = ? LIMIT 1`
    )
    .get(normalized) as Partner | undefined;
  if (sourceMatch) return sourceMatch;

  const channel = db
    .prepare(
      `SELECT p.*, c.url AS channel_url FROM partners p
       JOIN partner_channels c ON c.partner_id = p.id
       WHERE c.url IS NOT NULL`
    )
    .all() as (Partner & { channel_url: string | null })[];
  return channel.find((partner) => normalizeProfileUrl(partner.channel_url) === normalized);
}

export function findPartnerBySourceRecord(source: ImportSource, externalId: string): Partner | undefined {
  const id = externalId.trim();
  if (!id) return undefined;
  return db
    .prepare(
      `SELECT p.* FROM partners p
       JOIN partner_source_records s ON s.partner_id = p.id
       WHERE s.source = ? AND s.external_id = ? LIMIT 1`
    )
    .get(source, id) as Partner | undefined;
}

/** How many deals go with a partner, so a delete confirmation can say what it removes. */
export function partnerDealCount(id: number): number {
  return (db.prepare("SELECT COUNT(*) c FROM deals WHERE partner_id = ?").get(id) as { c: number })
    .c;
}

/**
 * Permanently removes a partner and everything under them. Unlike archive this can't be
 * undone — the caller is responsible for confirming it.
 *
 * deals.partner_id was added by ALTER TABLE, which can't carry a foreign key, so deleting
 * the partner would orphan their deals rather than remove them. The deals are deleted
 * explicitly here; each deal DOES cascade to its own content, payments and history.
 * Channels and partner-level onboarding are keyed to the partner with a real FK, so
 * those cascade on the final partner delete.
 */
export function deletePartner(id: number) {
  const deleteAll = db.transaction((partnerId: number) => {
    db.prepare("DELETE FROM deals WHERE partner_id = ?").run(partnerId);
    db.prepare("DELETE FROM partners WHERE id = ?").run(partnerId);
  });
  deleteAll(id);
}

export function getPartnerChannels(partnerId: number): PartnerChannel[] {
  return db
    .prepare("SELECT * FROM partner_channels WHERE partner_id = ? ORDER BY platform")
    .all(partnerId) as PartnerChannel[];
}

export function getPartnerContacts(partnerId: number): PartnerContact[] {
  return db
    .prepare("SELECT * FROM partner_contacts WHERE partner_id = ? ORDER BY created_at")
    .all(partnerId) as PartnerContact[];
}

export function addPartnerContact(fields: {
  partnerId: number;
  email: string;
  label?: string | null;
  source?: string | null;
}) {
  const email = normalizeEmail(fields.email);
  if (!email) return;
  db.prepare(
    `INSERT INTO partner_contacts (partner_id, email, label, source)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(partner_id, email) DO NOTHING`
  ).run(fields.partnerId, email, fields.label?.trim() || null, fields.source?.trim() || null);
}

export function getPartnerSourceRecords(partnerId: number): PartnerSourceRecord[] {
  return db
    .prepare("SELECT * FROM partner_source_records WHERE partner_id = ? ORDER BY imported_at DESC")
    .all(partnerId) as PartnerSourceRecord[];
}

/** Retain provider evidence without replacing the manager-owned partner profile. */
export function recordPartnerSource(fields: {
  partnerId: number;
  source: ImportSource;
  externalId?: string | null;
  profileUrl?: string | null;
  raw: Record<string, string>;
}) {
  const source = fields.source;
  const externalId = fields.externalId?.trim() || null;
  const profileUrl = normalizeProfileUrl(fields.profileUrl);
  const existing = externalId
    ? (db
        .prepare("SELECT id, partner_id FROM partner_source_records WHERE source = ? AND external_id = ?")
        .get(source, externalId) as { id: number; partner_id: number } | undefined)
    : profileUrl
      ? (db
          .prepare("SELECT id, partner_id FROM partner_source_records WHERE source = ? AND profile_url = ?")
          .get(source, profileUrl) as { id: number; partner_id: number } | undefined)
      : undefined;
  if (existing) {
    // A different partner means the caller should have treated this as an exact match.
    // Do not silently reassign a provider identity just because a source file is messy.
    if (existing.partner_id !== fields.partnerId) return existing.id;
    db.prepare(
      `UPDATE partner_source_records
       SET profile_url = COALESCE(?, profile_url), raw_data = ?, imported_at = datetime('now')
       WHERE id = ?`
    ).run(profileUrl, JSON.stringify(fields.raw), existing.id);
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO partner_source_records (partner_id, source, external_id, profile_url, raw_data)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(fields.partnerId, source, externalId, profileUrl, JSON.stringify(fields.raw));
  return Number(info.lastInsertRowid);
}

/** Fill blanks only. Imported evidence must never overwrite an existing correction. */
export function enrichPartnerFromImport(partnerId: number, candidate: CreatorImportCandidate) {
  const partner = getPartner(partnerId);
  if (!partner) return;
  if (candidate.email) {
    if (!partner.email) updatePartner(partnerId, { email: candidate.email });
    else if (normalizeEmail(partner.email) !== candidate.email) {
      addPartnerContact({ partnerId, email: candidate.email, source: candidate.source });
    }
  }
  if (candidate.platform) {
    const channel = getPartnerChannels(partnerId).find((item) => item.platform === candidate.platform);
    upsertPartnerChannel({
      partnerId,
      platform: candidate.platform,
      handle: channel?.handle ? undefined : candidate.handle,
      url: channel?.url ? undefined : candidate.profileUrl,
      followers: channel?.followers != null ? undefined : candidate.followers,
      avgViews: channel?.avg_views != null ? undefined : candidate.avgViews,
      engagementRate: channel?.engagement_rate != null ? undefined : candidate.engagementRate,
    });
  }
  recordPartnerSource({
    partnerId,
    source: candidate.source,
    externalId: candidate.sourceRecordId,
    profileUrl: candidate.profileUrl,
    raw: candidate.raw,
  });
}

export function createCreatorImportBatch(source: ImportSource, filename: string | null, rowCount: number): number {
  const result = db
    .prepare("INSERT INTO creator_import_batches (source, filename, row_count) VALUES (?, ?, ?)")
    .run(source, filename?.trim() || null, rowCount);
  return Number(result.lastInsertRowid);
}

export function recordCreatorImport(fields: {
  batchId: number;
  rowNumber: number;
  sourceRecordId?: string | null;
  result: string;
  partnerId?: number | null;
  dealId?: number | null;
  raw: Record<string, string>;
}) {
  db.prepare(
    `INSERT INTO creator_import_records
       (batch_id, row_number, source_record_id, result, partner_id, deal_id, raw_data)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    fields.batchId,
    fields.rowNumber,
    fields.sourceRecordId?.trim() || null,
    fields.result,
    fields.partnerId ?? null,
    fields.dealId ?? null,
    JSON.stringify(fields.raw)
  );
}

export function getGmailConnection(): (GmailConnectionSummary & { encrypted_tokens: string; scopes: string }) | null {
  const row = db.prepare("SELECT * FROM email_connections WHERE provider = 'gmail'").get() as
    | {
        account_email: string;
        encrypted_tokens: string;
        scopes: string;
        connected_at: string;
        last_sync_at: string | null;
        automation_started_at: string | null;
        last_automatic_sync_at: string | null;
        last_error: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    accountEmail: row.account_email,
    encrypted_tokens: row.encrypted_tokens,
    scopes: row.scopes,
    connectedAt: row.connected_at,
    lastSyncAt: row.last_sync_at,
    automationStartedAt: row.automation_started_at,
    lastAutomaticSyncAt: row.last_automatic_sync_at,
    lastError: row.last_error,
  };
}

export function saveGmailConnection(fields: { accountEmail: string; encryptedTokens: string; scopes: string }) {
  db.prepare(
    `INSERT INTO email_connections (
       provider, account_email, encrypted_tokens, scopes, connected_at, last_sync_at,
       automation_started_at, last_automatic_sync_at, last_error
     )
     VALUES ('gmail', ?, ?, ?, datetime('now'), NULL, NULL, NULL, NULL)
     ON CONFLICT(provider) DO UPDATE SET
       account_email = excluded.account_email,
       encrypted_tokens = excluded.encrypted_tokens,
       scopes = excluded.scopes,
       connected_at = datetime('now'),
       last_sync_at = NULL,
       automation_started_at = NULL,
       last_automatic_sync_at = NULL,
       last_error = NULL`
  ).run(fields.accountEmail, fields.encryptedTokens, fields.scopes);
}

export function updateGmailTokens(encryptedTokens: string) {
  db.prepare("UPDATE email_connections SET encrypted_tokens = ? WHERE provider = 'gmail'").run(encryptedTokens);
}

export function markGmailSync(fields: { error?: string | null }) {
  db.prepare(
    "UPDATE email_connections SET last_sync_at = CASE WHEN ? IS NULL THEN datetime('now') ELSE last_sync_at END, last_error = ? WHERE provider = 'gmail'"
  ).run(fields.error ?? null, fields.error ?? null);
}

export function startGmailAutomation(startedAt: string): string {
  db.prepare(
    `UPDATE email_connections
     SET automation_started_at = COALESCE(automation_started_at, ?)
     WHERE provider = 'gmail'`
  ).run(startedAt);
  const row = db
    .prepare("SELECT automation_started_at FROM email_connections WHERE provider = 'gmail'")
    .get() as { automation_started_at: string | null } | undefined;
  return row?.automation_started_at ?? startedAt;
}

export function markGmailAutomaticSync(fields: { error?: string | null }) {
  db.prepare(
    `UPDATE email_connections SET
       last_sync_at = CASE WHEN ? IS NULL THEN datetime('now') ELSE last_sync_at END,
       last_automatic_sync_at = CASE WHEN ? IS NULL THEN datetime('now') ELSE last_automatic_sync_at END,
       last_error = ?
     WHERE provider = 'gmail'`
  ).run(fields.error ?? null, fields.error ?? null, fields.error ?? null);
}

export function deleteGmailConnection() {
  db.prepare("DELETE FROM email_connections WHERE provider = 'gmail'").run();
}

export function getInboundEmail(provider: EmailProvider, providerMessageId: string): InboxEmail | undefined {
  return db
    .prepare(
      `SELECT i.*, p.name AS partner_name, d.creator AS deal_creator, d.stage AS deal_stage
       FROM inbound_emails i
       LEFT JOIN partners p ON p.id = i.partner_id
       LEFT JOIN deals d ON d.id = i.deal_id
       WHERE i.provider = ? AND i.provider_message_id = ?`
    )
    .get(provider, providerMessageId) as InboxEmail | undefined;
}

export function getInboxEmail(id: number): InboxEmail | undefined {
  return db
    .prepare(
      `SELECT i.*, p.name AS partner_name, d.creator AS deal_creator, d.stage AS deal_stage
       FROM inbound_emails i
       LEFT JOIN partners p ON p.id = i.partner_id
       LEFT JOIN deals d ON d.id = i.deal_id
       WHERE i.id = ?`
    )
    .get(id) as InboxEmail | undefined;
}

export function getInboxEmails(status?: InboxEmailStatus): InboxEmail[] {
  return db
    .prepare(
      `SELECT i.*, p.name AS partner_name, d.creator AS deal_creator, d.stage AS deal_stage
       FROM inbound_emails i
       LEFT JOIN partners p ON p.id = i.partner_id
       LEFT JOIN deals d ON d.id = i.deal_id
       ${status ? "WHERE i.status = ?" : ""}
       ORDER BY datetime(i.received_at) DESC, i.id DESC`
    )
    .all(...(status ? [status] : [])) as InboxEmail[];
}

export function saveInboundEmail(fields: {
  provider: EmailProvider;
  providerMessageId: string;
  providerThreadId?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  subject?: string | null;
  body: string;
  receivedAt: string;
  partnerId?: number | null;
  dealId?: number | null;
  matchKind: InboxMatchKind;
  autoEligible?: boolean;
}) {
  const result = db
    .prepare(
      `INSERT INTO inbound_emails (
        provider, provider_message_id, provider_thread_id, from_email, from_name, subject,
        body, received_at, partner_id, deal_id, match_kind, auto_eligible
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider, provider_message_id) DO NOTHING`
    )
    .run(
      fields.provider,
      fields.providerMessageId,
      fields.providerThreadId ?? null,
      normalizeEmail(fields.fromEmail) ?? null,
      fields.fromName?.trim().slice(0, 300) || null,
      fields.subject?.trim().slice(0, 500) || null,
      fields.body.slice(0, 40_000),
      fields.receivedAt,
      fields.partnerId ?? null,
      fields.dealId ?? null,
      fields.matchKind,
      fields.autoEligible ? 1 : 0
    );
  return Number(result.lastInsertRowid);
}

export function setInboundEmailStatus(fields: {
  id: number;
  status: InboxEmailStatus;
  importedMessageId?: number | null;
}) {
  db.prepare("UPDATE inbound_emails SET status = ?, imported_message_id = ? WHERE id = ?").run(
    fields.status,
    fields.importedMessageId ?? null,
    fields.id
  );
}

export function getOutboundEmail(provider: EmailProvider, providerMessageId: string): OutboundEmail | undefined {
  return db
    .prepare("SELECT * FROM outbound_emails WHERE provider = ? AND provider_message_id = ?")
    .get(provider, providerMessageId) as OutboundEmail | undefined;
}

export function saveOutboundEmail(fields: {
  provider: EmailProvider;
  providerMessageId: string;
  providerThreadId?: string | null;
  toEmail?: string | null;
  subject?: string | null;
  body: string;
  sentAt: string;
  partnerId?: number | null;
  dealId?: number | null;
  matchKind: InboxMatchKind;
}): OutboundEmail {
  db.prepare(
    `INSERT INTO outbound_emails (
       provider, provider_message_id, provider_thread_id, to_email, subject, body,
       sent_at, partner_id, deal_id, match_kind
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, provider_message_id) DO NOTHING`
  ).run(
    fields.provider,
    fields.providerMessageId,
    fields.providerThreadId ?? null,
    normalizeEmail(fields.toEmail) ?? null,
    fields.subject?.trim().slice(0, 500) || null,
    fields.body.slice(0, 40_000),
    fields.sentAt,
    fields.partnerId ?? null,
    fields.dealId ?? null,
    fields.matchKind
  );
  return getOutboundEmail(fields.provider, fields.providerMessageId)!;
}

export function setOutboundEmailImported(id: number, importedMessageId: number) {
  db.prepare("UPDATE outbound_emails SET imported_message_id = ? WHERE id = ?").run(
    importedMessageId,
    id
  );
}

/** Mints (or returns) the partner's portal token — the link IS the credential. */
export function ensurePartnerPortalToken(partnerId: number): string | null {
  const row = db.prepare("SELECT share_token FROM partners WHERE id = ?").get(partnerId) as
    | { share_token: string | null }
    | undefined;
  if (!row) return null;
  if (row.share_token) return row.share_token;
  const token = randomBytes(24).toString("base64url");
  db.prepare("UPDATE partners SET share_token = ? WHERE id = ?").run(token, partnerId);
  return token;
}

export function getPartnerByToken(token: string): Partner | undefined {
  if (!token) return undefined;
  return db.prepare("SELECT * FROM partners WHERE share_token = ?").get(token) as
    | Partner
    | undefined;
}

export function getContractDraft(dealId: number) {
  return db
    .prepare("SELECT * FROM contract_drafts WHERE deal_id = ? ORDER BY id DESC LIMIT 1")
    .get(dealId) as
    | { id: number; deal_id: number; body: string; status: "draft" | "signed"; updated_at: string }
    | undefined;
}

export function saveContractDraft(dealId: number, body: string): void {
  const existing = getContractDraft(dealId);
  // A signed draft is a record, not a document under edit.
  if (existing && existing.status === "signed") return;
  if (existing) {
    db.prepare("UPDATE contract_drafts SET body = ?, updated_at = datetime('now') WHERE id = ?")
      .run(body, existing.id);
  } else {
    db.prepare("INSERT INTO contract_drafts (deal_id, body) VALUES (?, ?)").run(dealId, body);
  }
}

export function markContractDraftSigned(dealId: number): boolean {
  const r = db
    .prepare("UPDATE contract_drafts SET status = 'signed', updated_at = datetime('now') WHERE deal_id = ? AND status = 'draft'")
    .run(dealId);
  return r.changes > 0;
}

export function savePartnerLegalDetails(
  partnerId: number,
  f: { legalName: string; companyName: string; taxId: string; legalAddress: string }
) {
  db.prepare(
    `UPDATE partners SET legal_name = ?, company_name = ?, tax_id = ?, legal_address = ?,
       updated_at = datetime('now') WHERE id = ?`
  ).run(f.legalName || null, f.companyName || null, f.taxId || null, f.legalAddress || null, partnerId);
}

/**
 * The brief's checkable obligations, extracted once and then owned by the manager.
 *
 * Stored as JSON on the campaign rather than normalised into rows because it is edited
 * as a whole — you re-read the brief, fix the list, save — and never queried across
 * campaigns. Writing null clears it, which is what happens when a new brief is uploaded
 * and the old requirements no longer describe it.
 */
export function setCampaignBriefRequirements(campaignId: number, json: string | null) {
  db.prepare("UPDATE campaigns SET brief_requirements = ? WHERE id = ?").run(json, campaignId);
}

export function setCampaignBrief(
  campaignId: number,
  f: { path: string; filename: string; mime: string }
) {
  // Clearing the requirements is deliberate: they described the brief being replaced,
  // and silently keeping them would check videos against a document nobody uploaded.
  db.prepare(
    "UPDATE campaigns SET brief_path = ?, brief_filename = ?, brief_mime = ?, brief_requirements = NULL WHERE id = ?"
  ).run(f.path, f.filename, f.mime, campaignId);
}

/* ------------------------------------------------------------- reminders */

export function createReminder(fields: {
  title: string;
  dueOn: string;
  partnerId?: number | null;
  dealId?: number | null;
}): number {
  const info = db
    .prepare(
      "INSERT INTO reminders (title, due_on, partner_id, deal_id) VALUES (?, ?, ?, ?)"
    )
    .run(fields.title, fields.dueOn, fields.partnerId ?? null, fields.dealId ?? null);
  return Number(info.lastInsertRowid);
}

/** Reminders shown on a deal or partner page — open first, soonest first. */
export function getRemindersFor(scope: { partnerId?: number; dealId?: number }): Reminder[] {
  if (scope.dealId != null) {
    return db
      .prepare(
        "SELECT * FROM reminders WHERE deal_id = ? ORDER BY status = 'done', due_on"
      )
      .all(scope.dealId) as Reminder[];
  }
  if (scope.partnerId != null) {
    // A partner page shows the partner's own reminders AND those on their deals — the
    // person is the subject either way.
    return db
      .prepare(
        `SELECT r.* FROM reminders r
         LEFT JOIN deals d ON d.id = r.deal_id
         WHERE r.partner_id = ? OR d.partner_id = ?
         ORDER BY r.status = 'done', r.due_on`
      )
      .all(scope.partnerId, scope.partnerId) as Reminder[];
  }
  return [];
}

export function getOpenReminders(): Reminder[] {
  return db
    .prepare("SELECT * FROM reminders WHERE status = 'open' ORDER BY due_on")
    .all() as Reminder[];
}

export function getReminder(id: number): Reminder | undefined {
  return db.prepare("SELECT * FROM reminders WHERE id = ?").get(id) as Reminder | undefined;
}

export function setReminderStatus(id: number, status: "open" | "done") {
  db.prepare(
    `UPDATE reminders SET status = ?,
       done_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END
     WHERE id = ?`
  ).run(status, status, id);
}

export function deleteReminder(id: number) {
  db.prepare("DELETE FROM reminders WHERE id = ?").run(id);
}

/** Typical reach per platform for every partner, for allocating bundle fees. */
export function getExpectedReach(): Map<string, number> {
  const rows = db
    .prepare(
      "SELECT partner_id, platform, avg_views FROM partner_channels WHERE avg_views IS NOT NULL"
    )
    .all() as { partner_id: number; platform: string; avg_views: number }[];
  return new Map(rows.map((r) => [`${r.partner_id}:${r.platform}`, r.avg_views]));
}

export function getPartnerDeals(partnerId: number): Deal[] {
  return db
    .prepare("SELECT * FROM deals WHERE partner_id = ? ORDER BY updated_at DESC")
    .all(partnerId) as Deal[];
}

export function createPartner(fields: {
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: string[];
  category?: string | null;
}): number {
  const info = db
    .prepare(
      "INSERT INTO partners (name, email, phone, notes, tags, category) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      fields.name.trim(),
      fields.email?.trim() || null,
      fields.phone?.trim() || null,
      fields.notes?.trim() || null,
      JSON.stringify(fields.tags ?? []),
      fields.category?.trim() || null
    );
  return Number(info.lastInsertRowid);
}

export function updatePartner(
  id: number,
  fields: {
    name?: string;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    tags?: string[];
    category?: string | null;
    archived?: 0 | 1;
  }
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, value: unknown) => {
    sets.push(`${col} = ?`);
    params.push(value);
  };
  if (fields.name !== undefined) push("name", fields.name.trim());
  if (fields.email !== undefined) push("email", fields.email?.trim() || null);
  if (fields.phone !== undefined) push("phone", fields.phone?.trim() || null);
  if (fields.notes !== undefined) push("notes", fields.notes?.trim() || null);
  if (fields.tags !== undefined) push("tags", JSON.stringify(fields.tags));
  if (fields.category !== undefined) push("category", fields.category?.trim() || null);
  if (fields.archived !== undefined) push("archived", fields.archived);
  if (sets.length === 0) return;
  db.prepare(
    `UPDATE partners SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`
  ).run(...params, id);
}

export function upsertPartnerChannel(fields: {
  partnerId: number;
  platform: string;
  handle?: string | null;
  url?: string | null;
  followers?: number | null;
  avgViews?: number | null;
  engagementRate?: number | null;
}) {
  const existing = db
    .prepare("SELECT id FROM partner_channels WHERE partner_id = ? AND platform = ?")
    .get(fields.partnerId, fields.platform) as { id: number } | undefined;

  if (existing) {
    // Partial update, like updatePartner: only fields the caller actually supplied are
    // written. The old full-row overwrite turned every omitted field into NULL — and
    // since intake never passes handle or followers, creating a second deal for a
    // returning creator silently wiped the reach data pricing depends on.
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown) => {
      if (value !== undefined) {
        sets.push(`${column} = ?`);
        params.push(value);
      }
    };
    set("handle", fields.handle);
    set("url", fields.url);
    set("followers", fields.followers);
    set("avg_views", fields.avgViews);
    set("engagement_rate", fields.engagementRate);
    if (sets.length > 0) {
      db.prepare(
        `UPDATE partner_channels SET ${sets.join(", ")}, updated_at = datetime('now') WHERE id = ?`
      ).run(...params, existing.id);
    }
    return existing.id;
  }
  const info = db
    .prepare(
      `INSERT INTO partner_channels (partner_id, platform, handle, url, followers, avg_views, engagement_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.partnerId,
      fields.platform,
      fields.handle ?? null,
      fields.url ?? null,
      fields.followers ?? null,
      fields.avgViews ?? null,
      fields.engagementRate ?? null
    );
  return Number(info.lastInsertRowid);
}

export function deletePartnerChannel(id: number) {
  db.prepare("DELETE FROM partner_channels WHERE id = ?").run(id);
}

export function getCampaigns(includeArchived = false): Campaign[] {
  return db
    .prepare(
      `SELECT * FROM campaigns ${includeArchived ? "" : "WHERE archived = 0"} ORDER BY created_at DESC`
    )
    .all() as Campaign[];
}

export function getCampaign(id: number): Campaign | undefined {
  return db.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as Campaign | undefined;
}

export function createCampaign(
  name: string,
  overrides: object,
  budget: number | null,
  strategy?: { objective?: string | null; primaryKpi?: string | null; kpiTarget?: number | null }
): number {
  const info = db
    .prepare(
      "INSERT INTO campaigns (name, overrides, budget, objective, primary_kpi, kpi_target) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(
      name,
      JSON.stringify(overrides),
      budget,
      strategy?.objective ?? null,
      strategy?.primaryKpi ?? null,
      strategy?.kpiTarget ?? null
    );
  return Number(info.lastInsertRowid);
}

export function updateCampaign(
  id: number,
  fields: {
    name?: string;
    overrides?: object;
    budget?: number | null;
    objective?: string | null;
    primaryKpi?: string | null;
    kpiTarget?: number | null;
  }
) {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.name !== undefined) {
    sets.push("name = ?");
    params.push(fields.name);
  }
  if (fields.overrides !== undefined) {
    sets.push("overrides = ?");
    params.push(JSON.stringify(fields.overrides));
  }
  if (fields.budget !== undefined) {
    sets.push("budget = ?");
    params.push(fields.budget);
  }
  if (fields.objective !== undefined) {
    sets.push("objective = ?");
    params.push(fields.objective);
  }
  if (fields.primaryKpi !== undefined) {
    sets.push("primary_kpi = ?");
    params.push(fields.primaryKpi);
  }
  if (fields.kpiTarget !== undefined) {
    sets.push("kpi_target = ?");
    params.push(fields.kpiTarget);
  }
  if (sets.length === 0) return;
  db.prepare(`UPDATE campaigns SET ${sets.join(", ")} WHERE id = ?`).run(...params, id);
}

export function archiveCampaign(id: number) {
  db.prepare("UPDATE campaigns SET archived = 1 WHERE id = ?").run(id);
}

/** Money committed to a campaign: closed deals + offers currently on the table. */
export function getCampaignSpend(campaignId: number): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(
         CASE WHEN stage = 'agreed' THEN COALESCE(agreed_price, 0)
              WHEN stage IN ('offer_sent','negotiating') THEN COALESCE(current_offer, 0)
              ELSE 0 END), 0) AS spend
       FROM deals WHERE campaign_id = ?`
    )
    .get(campaignId) as { spend: number };
  return row.spend;
}

/**
 * Claims the deal's single job slot. Returns false when a live job already holds it —
 * the caller should refuse, not queue. Without this, "Run analysis" then "Regenerate"
 * ten seconds later ran two jobs against one deal: the second overwrote the first's
 * flag, the first's finish cleared the second's, and the poller reported done while a
 * background write was still coming. A job older than the stale window is presumed
 * dead (matching failStaleJobs) and its slot is taken over.
 */
export function setJob(dealId: number, status: "analyzing" | "recommending"): boolean {
  const result = db
    .prepare(
      `UPDATE deals SET job_status = ?, job_error = NULL, job_started_at = datetime('now')
       WHERE id = ? AND (
         job_status IS NULL
         OR job_started_at IS NULL
         OR job_started_at < datetime('now', '-15 minutes')
       )`
    )
    .run(status, dealId);
  return result.changes > 0;
}

export function clearJob(dealId: number, error?: string) {
  db.prepare(
    "UPDATE deals SET job_status = NULL, job_started_at = NULL, job_error = ? WHERE id = ?"
  ).run(error ?? null, dealId);
}

export function logUsage(
  dealId: number | null,
  kind: "analysis" | "recommendation" | "brief" | "integration_check" | "extraction" | "rewrite",
  model: string,
  inputTokens: number,
  outputTokens: number,
  /**
   * Cached tokens, which are NOT part of inputTokens.
   *
   * The API reports input_tokens as the uncached remainder only. Once a cache
   * breakpoint is in play that number collapses — a real analysis logged 2 — so
   * recording it alone made the most expensive call in the product look free.
   */
  cacheCreationTokens = 0,
  cacheReadTokens = 0,
  /**
   * Who to bill. Null throughout today — single tenant — but written by the same call
   * that writes the tokens, so the day an account exists there is no backfill to guess at.
   */
  scope: { accountId?: number | null; brandId?: number | null } = {}
) {
  const costCents = Math.round(
    usageCostUsd({ inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens }) * 100
  );
  db.prepare(
    `INSERT INTO usage_log (deal_id, kind, model, input_tokens, output_tokens,
       cache_creation_tokens, cache_read_tokens, account_id, brand_id, cost_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dealId,
    kind,
    model,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    scope.accountId ?? null,
    scope.brandId ?? null,
    costCents
  );
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export function getUsageTotals(dealId?: number): UsageTotals {
  const where = dealId != null ? "WHERE deal_id = ?" : "";
  const row = db
    .prepare(
      `SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS inputTokens,
              COALESCE(SUM(output_tokens),0) AS outputTokens,
              COALESCE(SUM(cache_creation_tokens),0) AS cacheCreationTokens,
              COALESCE(SUM(cache_read_tokens),0) AS cacheReadTokens FROM usage_log ${where}`
    )
    .get(...(dealId != null ? [dealId] : [])) as UsageTotals;
  return row;
}

/**
 * When a given kind of Copilot run last completed for this deal.
 *
 * The analysis on screen is a stored snapshot: it can be days old and computed from
 * inputs that have since been corrected (a fixed avg-views figure, an edited Playbook),
 * with nothing on the page saying so. Surfacing the run time is what lets someone tell
 * "the model thinks this" from "the model thought this, before I fixed the numbers".
 */
export function getLastRunAt(dealId: number, kind: string): string | null {
  const row = db
    .prepare(
      "SELECT created_at FROM usage_log WHERE deal_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1"
    )
    .get(dealId, kind) as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

export function getMessages(dealId: number): Message[] {
  return db.prepare("SELECT * FROM messages WHERE deal_id = ? ORDER BY created_at, id").all(dealId) as Message[];
}

/**
 * Dashboard follow-up detection needs the last outbound note and to know whether a
 * creator replied after it. Fetching only human conversation messages keeps it a single
 * small query without pulling Copilot output into a workflow rule.
 */
export function getFollowUpMessages(): Message[] {
  return db
    .prepare(
      "SELECT * FROM messages WHERE sender IN ('us', 'them') ORDER BY deal_id, created_at, id"
    )
    .all() as Message[];
}

export function getFollowUpState(dealId: number): FollowUpState | undefined {
  return db
    .prepare("SELECT * FROM deal_followup_states WHERE deal_id = ?")
    .get(dealId) as FollowUpState | undefined;
}

export function getFollowUpStates(): FollowUpState[] {
  return db.prepare("SELECT * FROM deal_followup_states").all() as FollowUpState[];
}

export function snoozeFollowUp({
  dealId,
  anchorMessageId,
  anchorAt,
  snoozedUntil,
}: {
  dealId: number;
  anchorMessageId: number | null;
  anchorAt: string;
  snoozedUntil: string;
}) {
  db.prepare(
    `INSERT INTO deal_followup_states (deal_id, anchor_message_id, anchor_at, snoozed_until)
     VALUES (@dealId, @anchorMessageId, @anchorAt, @snoozedUntil)
     ON CONFLICT(deal_id) DO UPDATE SET
       anchor_message_id = excluded.anchor_message_id,
       anchor_at = excluded.anchor_at,
       snoozed_until = excluded.snoozed_until,
       updated_at = datetime('now')`
  ).run({ dealId, anchorMessageId, anchorAt, snoozedUntil });
}

export function clearFollowUpState(dealId: number) {
  db.prepare("DELETE FROM deal_followup_states WHERE deal_id = ?").run(dealId);
}

/**
 * A platform's rules with defaults filled in. Merged on read so a field added after an
 * install still reaches the engine, instead of applying only once someone happens to
 * re-save the Playbook page.
 */
export function getPlaybook(platform: string): Record<string, unknown> | null {
  const row = db.prepare("SELECT rules FROM playbook WHERE platform = ?").get(platform) as
    | { rules: string }
    | undefined;
  const defaults = DEFAULT_PLATFORM_RULES[platform as PlatformKey];
  if (!row) return defaults ? { ...defaults } : null;
  return { ...(defaults ?? {}), ...JSON.parse(row.rules) };
}

/** Target market and monthly budget — one set of values, not one per platform. */
export function getGlobalRules(): Record<string, unknown> {
  return {
    ...DEFAULT_GLOBAL_RULES,
    ...(getSetting<Record<string, unknown>>("global_rules") ?? {}),
  };
}

/** Sender identity and product name, for drafts. */
export function getBrandProfile(): Record<string, string> {
  return {
    ...DEFAULT_BRAND_PROFILE,
    ...(getSetting<Record<string, string>>("brand_profile") ?? {}),
  };
}

export function getUnitEconomics(): Record<string, number> {
  return {
    ...DEFAULT_UNIT_ECONOMICS,
    ...(getSetting<Record<string, number>>("unit_economics") ?? {}),
  };
}

export function getNegotiationStyle(): Record<string, unknown> {
  return {
    ...DEFAULT_NEGOTIATION_STYLE,
    ...(getSetting<Record<string, unknown>>("negotiation_style") ?? {}),
  };
}

export function getSetting<T>(key: string): T | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : null;
}

export function createDeal(fields: {
  creator: string;
  platforms: string[];
  deliverables?: string | null;
  format?: string | null;
  campaign?: string | null;
  campaignId?: number | null;
  partnerId?: number | null;
  stage?: string;
  first_ask?: number | null;
  status_label?: string | undefined;
  avg_views?: number | null;
  engagement_rate?: number | null;
}): number {
  const info = db
    .prepare(
      `INSERT INTO deals (creator, platform, platforms, deliverables, format, campaign, campaign_id, partner_id, stage,
        first_ask, current_ask, avg_views, engagement_rate, status_label, status_tone)
       VALUES (@creator, @platform, @platforms, @deliverables, @format, @campaign, @campaign_id, @partner_id, @stage,
        @first_ask, @first_ask, @avg_views, @engagement_rate, @status_label, 'neutral')`
    )
    .run({
      creator: fields.creator,
      platform: fields.platforms[0],
      platforms: JSON.stringify(fields.platforms),
      deliverables: fields.deliverables ?? null,
      format: fields.format ?? null,
      campaign: fields.campaign ?? null,
      campaign_id: fields.campaignId ?? null,
      partner_id: fields.partnerId ?? null,
      stage: fields.stage ?? "analyzing",
      first_ask: fields.first_ask ?? null,
      avg_views: fields.avg_views ?? null,
      engagement_rate: fields.engagement_rate ?? null,
      status_label: fields.status_label ?? "Awaiting analysis",
    });
  return Number(info.lastInsertRowid);
}

export function setPlaybook(platform: string, rules: Record<string, unknown>) {
  db.prepare(
    "INSERT INTO playbook (platform, rules) VALUES (?, ?) ON CONFLICT(platform) DO UPDATE SET rules = excluded.rules"
  ).run(platform, JSON.stringify(rules));
}

export function setSetting(key: string, value: unknown) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, JSON.stringify(value));
}

export function getMessage(id: number): Message | undefined {
  return db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as Message | undefined;
}

export function deleteMessage(id: number) {
  db.prepare("DELETE FROM messages WHERE id = ?").run(id);
}

export function addMessage(
  dealId: number,
  sender: "them" | "us" | "copilot",
  body: string,
  meta?: Record<string, unknown>
) {
  db.prepare("INSERT INTO messages (deal_id, sender, body, meta) VALUES (?, ?, ?, ?)").run(
    dealId,
    sender,
    body,
    meta ? JSON.stringify(meta) : null
  );
  touchDeal(dealId);
}

/** Store provider-originated mail at its real timestamp and return its durable message id. */
export function addSyncedMessage(
  dealId: number,
  sender: "them" | "us",
  body: string,
  createdAt: string,
  meta: Record<string, unknown>
): number {
  const result = db
    .prepare(
      "INSERT INTO messages (deal_id, sender, body, meta, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(dealId, sender, body, JSON.stringify(meta), createdAt);
  touchDeal(dealId);
  return Number(result.lastInsertRowid);
}

export function touchDeal(dealId: number) {
  db.prepare("UPDATE deals SET updated_at = datetime('now') WHERE id = ?").run(dealId);
}

export function updateDeal(dealId: number, fields: Record<string, unknown>) {
  const allowed = [
    "stage", "round", "your_move", "first_ask", "current_ask", "current_offer",
    "agreed_price", "agreed_at", "anchor", "target", "walkaway", "breakeven", "avg_views",
    "engagement_rate", "audience_locked", "notes", "rights", "contacted_at", "status_label", "status_tone", "campaign", "analysis", "channel_url",
    "actual_views", "actual_engagements", "actual_clicks", "actual_orders", "actual_revenue", "actuals_logged_at",
    "job_status", "job_error", "job_started_at",
    "partner_id", "campaign_id", "deal_type",
    "decline_reason", "decline_note", "declined_at", "revisit_on",
    "commission_type", "commission_value", "discount_type", "discount_value",
  ];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE deals SET ${setClause}, updated_at = datetime('now') WHERE id = @__id`).run({
    ...Object.fromEntries(keys.map((k) => [k, fields[k]])),
    __id: dealId,
  });
}

export interface PipelineKpis {
  activeDeals: number;
  waitingOnYou: number;
  committed: number;
  monthlyCap: number;
  avgClosedCpm: number | null;
  targetCpm: number;
  savedVsFirstAsk: number;
}

export function getPipelineKpis(): PipelineKpis {
  const deals = getDeals();
  const active = deals.filter(
    (d) => d.stage !== "agreed" && d.stage !== "completed" && d.stage !== "declined"
  );
  // Won deals, whether still being delivered or fully wrapped up.
  const agreed = deals.filter((d) => d.stage === "agreed" || d.stage === "completed");

  // SQLite datetime('now') stores "YYYY-MM-DD HH:MM:SS" in UTC. Keyed on agreed_at —
  // when the deal was won — never updated_at, which any edit bumps.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const inThisMonth = (d: Deal) => (d.agreed_at ?? "").slice(0, 7) === currentMonth;
  const agreedThisMonth = agreed.filter(inThisMonth);

  // Committed this month = deals closed this month + offers currently on the table.
  const committed =
    agreedThisMonth.reduce((s, d) => s + (d.agreed_price ?? 0), 0) +
    deals
      .filter((d) => d.stage === "offer_sent" || d.stage === "negotiating")
      .reduce((s, d) => s + (d.current_offer ?? 0), 0);

  // Avg closed CPM stays all-time — it's a calibration benchmark, not a monthly stat.
  const closedWithViews = agreed.filter((d) => d.avg_views && d.agreed_price);
  const avgClosedCpm =
    closedWithViews.length > 0
      ? closedWithViews.reduce((s, d) => s + (d.agreed_price! / d.avg_views!) * 1000, 0) / closedWithViews.length
      : null;

  const savedVsFirstAsk = agreedThisMonth.reduce(
    (s, d) => s + Math.max(0, (d.first_ask ?? 0) - (d.agreed_price ?? 0)),
    0
  );

  const yt = getPlaybook("youtube") as { maxCpmIntegration?: number } | null;
  const globals = getGlobalRules() as { monthlyCap?: number };

  return {
    activeDeals: active.length,
    waitingOnYou: active.filter((d) => d.your_move === 1).length,
    committed,
    monthlyCap: globals.monthlyCap ?? 25000,
    avgClosedCpm,
    targetCpm: yt?.maxCpmIntegration ?? 28,
    savedVsFirstAsk,
  };
}

export default db;
