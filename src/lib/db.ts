import Database from "better-sqlite3";
import { randomBytes } from "crypto";
import path from "path";
import fs from "fs";
import type { Deal, Message } from "./types";
import { ALL_PLATFORMS, ALL_STAGES } from "./types";
import {
  DEFAULT_BRAND_PROFILE,
  DEFAULT_GLOBAL_RULES,
  DEFAULT_NEGOTIATION_STYLE,
  DEFAULT_PLATFORM_RULES,
  DEFAULT_UNIT_ECONOMICS,
  type PlatformKey,
} from "./playbook-defaults";
import type { Campaign } from "./campaigns";
import type { Partner, PartnerChannel } from "./partners";
import type { Reminder } from "./reminders";

const dataDir = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "counterpart.db"));
db.pragma("journal_mode = WAL");
// Deleting a deal or partner relies on ON DELETE CASCADE to clear its children.
// SQLite leaves foreign keys off per connection unless asked, so make it explicit
// rather than trust a default — an orphaned payment row is a silent data bug.
db.pragma("foreign_keys = ON");

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
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Lightweight migrations for existing databases
{
  const cols = (db.prepare("PRAGMA table_info(deals)").all() as { name: string }[]).map(
    (c) => c.name
  );
  if (!cols.includes("platforms")) db.exec("ALTER TABLE deals ADD COLUMN platforms TEXT");
  if (!cols.includes("deliverables")) db.exec("ALTER TABLE deals ADD COLUMN deliverables TEXT");
  if (!cols.includes("channel_url")) db.exec("ALTER TABLE deals ADD COLUMN channel_url TEXT");
  if (!cols.includes("actual_views")) db.exec("ALTER TABLE deals ADD COLUMN actual_views INTEGER");
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
  }
  db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
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

export function getPartner(id: number): Partner | undefined {
  return db.prepare("SELECT * FROM partners WHERE id = ?").get(id) as Partner | undefined;
}

export function findPartnerByName(name: string): Partner | undefined {
  return db.prepare("SELECT * FROM partners WHERE name = ? COLLATE NOCASE").get(name) as
    | Partner
    | undefined;
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
}): number {
  const info = db
    .prepare("INSERT INTO partners (name, email, phone, notes, tags) VALUES (?, ?, ?, ?, ?)")
    .run(
      fields.name.trim(),
      fields.email?.trim() || null,
      fields.phone?.trim() || null,
      fields.notes?.trim() || null,
      JSON.stringify(fields.tags ?? [])
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

export function createCampaign(name: string, overrides: object, budget: number | null): number {
  const info = db
    .prepare("INSERT INTO campaigns (name, overrides, budget) VALUES (?, ?, ?)")
    .run(name, JSON.stringify(overrides), budget);
  return Number(info.lastInsertRowid);
}

export function updateCampaign(
  id: number,
  fields: { name?: string; overrides?: object; budget?: number | null }
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
  kind: "analysis" | "recommendation" | "brief" | "integration_check" | "extraction",
  model: string,
  inputTokens: number,
  outputTokens: number
) {
  db.prepare(
    "INSERT INTO usage_log (deal_id, kind, model, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)"
  ).run(dealId, kind, model, inputTokens, outputTokens);
}

export interface UsageTotals {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export function getUsageTotals(dealId?: number): UsageTotals {
  const where = dealId != null ? "WHERE deal_id = ?" : "";
  const row = db
    .prepare(
      `SELECT COUNT(*) AS calls, COALESCE(SUM(input_tokens),0) AS inputTokens,
              COALESCE(SUM(output_tokens),0) AS outputTokens FROM usage_log ${where}`
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

export function touchDeal(dealId: number) {
  db.prepare("UPDATE deals SET updated_at = datetime('now') WHERE id = ?").run(dealId);
}

export function updateDeal(dealId: number, fields: Record<string, unknown>) {
  const allowed = [
    "stage", "round", "your_move", "first_ask", "current_ask", "current_offer",
    "agreed_price", "agreed_at", "anchor", "target", "walkaway", "breakeven", "avg_views",
    "engagement_rate", "audience_locked", "notes", "status_label", "status_tone", "campaign", "analysis", "channel_url",
    "actual_views", "actual_clicks", "actual_orders", "actual_revenue", "actuals_logged_at",
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
