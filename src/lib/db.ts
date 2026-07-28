import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { Deal, Message } from "./types";
import { ALL_STAGES } from "./types";
import type { Campaign } from "./campaigns";
import type { Partner, PartnerChannel } from "./partners";

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
  platform TEXT NOT NULL CHECK (platform IN ('youtube','instagram','tiktok')),
  format TEXT,
  stage TEXT NOT NULL DEFAULT 'analyzing' CHECK (stage IN ('lead','contacted','analyzing','offer_sent','negotiating','agreed','declined')),
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
  db.exec(`CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    overrides TEXT NOT NULL DEFAULT '{}',
    budget INTEGER,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
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
 * SQLite can't ALTER a CHECK constraint, so adding a stage means rebuilding the table
 * from its own stored DDL with the constraint swapped. Driven by ALL_STAGES, so future
 * stages migrate an existing database on next boot without another bespoke migration.
 */
function widenStageConstraint() {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'deals'")
    .get() as { sql: string } | undefined;
  if (!row) return;

  const wanted = `CHECK (stage IN (${ALL_STAGES.map((s) => `'${s}'`).join(",")}))`;
  if (row.sql.includes(wanted)) return;

  const rebuilt = row.sql
    .replace(/CHECK\s*\(\s*stage\s+IN\s*\([^)]*\)\s*\)/i, wanted)
    .replace(/CREATE TABLE\s+"?deals"?/i, "CREATE TABLE deals_migrate");

  db.pragma("foreign_keys = OFF");
  db.transaction(() => {
    db.exec(rebuilt);
    db.exec("INSERT INTO deals_migrate SELECT * FROM deals");
    db.exec("DROP TABLE deals");
    db.exec("ALTER TABLE deals_migrate RENAME TO deals");
  })();
  db.pragma("foreign_keys = ON");
}
widenStageConstraint();

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
      "Their €3,500 ask is 30% above your walk-away, but the channel's fundamentals support €2,200–2,700. Engagement and audience quality pass your Playbook; price is the only real gap. Recommended path: anchor at €1,950 and trade scope before price.",
    metrics: [
      { label: "Avg views · last 30 videos", value: "96.4K", note: "▼ 18% over 90 days", tone: "warn" },
      { label: "Engagement rate", value: "4.7%", note: "✓ min 3.5%", tone: "good" },
      { label: "CPM at their ask", value: "€36.30", note: "✗ max €28.00", tone: "crit" },
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
          "96.4K avg views × your target CPM of €23.30 (niche benchmark €26, discounted 10% for the view-trend decline and geo shortfall).",
      },
      {
        label: "Walk-away",
        value: 2700,
        explanation:
          "Your Playbook max CPM €28.00 × 96.4K avg views. Above this the deal fails your rules regardless of how the conversation goes.",
      },
      {
        label: "Breakeven",
        value: 3050,
        explanation:
          "Predicted 1,157 clicks (1.2% CTR) × 3.0% conversion × €120 AOV × 60% margin × 1.35 repeat factor. Above breakeven the deal loses money even if it performs to forecast.",
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
      "Hi! Thanks for reaching out — I love the product. My rate for a dedicated integration (60–90s) is €3,500 including one round of revisions. Happy to jump on a call!",
      null
    );
    insertMsg.run(
      marta, "us",
      "Thanks Marta! We ran the numbers on recent performance — for a 60–90s integration our budget model works out to €1,950. That's based on your last-30-video average views, and we'd love to make this the first of several collaborations if it performs. Would that work as a starting point?",
      JSON.stringify({ offer: 1950 })
    );
    insertMsg.run(
      marta, "them",
      "I appreciate the transparency! €1,950 is quite far from my rate though. Considering the production quality I put in, the lowest I could do is €3,100.",
      JSON.stringify({ counter: 3100 })
    );
    insertMsg.run(
      marta, "copilot",
      "Counter €2,300 and trade usage rights",
      JSON.stringify({
        round: 2,
        headline: "Counter €2,300 and trade usage rights",
        proposedOffer: 2300,
        pills: [
          { label: "Counter: €2,300", tone: "good" },
          { label: "+ ask: 60-day ad usage rights", tone: "plain" },
          { label: "Headroom left: €400", tone: "plain" },
        ],
        reasoning: [
          "€2,300 = €23.90 CPM on her real average views — inside your €28 max, just above your €2,250 target.",
          "She moved €400 (3,500 → 3,100); moving €350 mirrors her concession size and signals your ceiling is near.",
          "Asking for usage rights makes your raise a trade, not a cave — she can accept the price by giving scope.",
          "Expected counter: €2,700–2,900. Plan: hold €2,300–2,500, offer whitelisting or a 2-video bundle instead of more cash.",
        ],
        drafts: {
          balanced:
            "Totally understand, Marta — your production quality shows. Here's where we can realistically land: €2,300, and to make it worth the gap we'd include 60-day usage rights so we can run the segment as ads (that's real added value on our side, and extra reach for you). If the video performs against our benchmarks, we'd lock a multi-video deal at a higher rate for the next round. Deal?",
          warm:
            "Marta, we really do want to make this work — your content is exactly the fit we look for. We can stretch to €2,300 if we can also use the segment in our ads for 60 days. And honestly, our favorite creators are the ones we work with repeatedly: if this one performs, the next deal starts from a better number. Can we shake on that?",
          firm:
            "Appreciate you moving, Marta. To be transparent: our model prices your channel on the last-30-video average (96K views), which puts a 60–90s integration at €2,300 — that's already at the top of our range. We can do €2,300 with 60-day usage rights included. If that doesn't work for this quarter, we'd genuinely like to revisit when the timing is better.",
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
      commissionPercent: 0, productCost: 0, minPaidFee: 100,
    }));
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run("negotiation_style", JSON.stringify({
      style: "balanced", anchorBelowTargetPct: [12, 15], warnAtWalkawayPct: 90, maxStepPct: 10,
      concessionLadder: [
        "Add smaller deliverable (story / short) instead of raising price",
        "Trade usage rights (60 d) for meeting their number",
        "Multi-video bundle at −12–15% per video",
        "Performance bonus up to €300",
        "Raise price — steps ≤ 10%, never past walk-away",
      ],
      nonNegotiables: ["Draft approval before publish", "Net-30 payment", "Trackable link + promo code"],
    }));
  });
  insertAll();
  setSetting("seeded", true);
}
seedIfEmpty();
// Runs after seeding so demo deals get partners too; no-ops once every deal is linked.
backfillPartners();

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
    db.prepare(
      `UPDATE partner_channels SET handle = ?, url = ?, followers = ?, avg_views = ?,
         engagement_rate = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(
      fields.handle ?? null,
      fields.url ?? null,
      fields.followers ?? null,
      fields.avgViews ?? null,
      fields.engagementRate ?? null,
      existing.id
    );
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

export function setJob(dealId: number, status: "analyzing" | "recommending") {
  db.prepare(
    "UPDATE deals SET job_status = ?, job_error = NULL, job_started_at = datetime('now') WHERE id = ?"
  ).run(status, dealId);
}

export function clearJob(dealId: number, error?: string) {
  db.prepare(
    "UPDATE deals SET job_status = NULL, job_started_at = NULL, job_error = ? WHERE id = ?"
  ).run(error ?? null, dealId);
}

export function logUsage(
  dealId: number | null,
  kind: "analysis" | "recommendation",
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

export function getMessages(dealId: number): Message[] {
  return db.prepare("SELECT * FROM messages WHERE deal_id = ? ORDER BY created_at, id").all(dealId) as Message[];
}

export function getPlaybook(platform: string): Record<string, unknown> | null {
  const row = db.prepare("SELECT rules FROM playbook WHERE platform = ?").get(platform) as { rules: string } | undefined;
  return row ? JSON.parse(row.rules) : null;
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
    "agreed_price", "anchor", "target", "walkaway", "breakeven", "avg_views",
    "engagement_rate", "status_label", "status_tone", "campaign", "analysis", "channel_url",
    "actual_views", "actual_clicks", "actual_orders", "actual_revenue", "actuals_logged_at",
    "job_status", "job_error", "job_started_at",
    "partner_id", "campaign_id", "deal_type",
    "decline_reason", "decline_note", "declined_at", "revisit_on",
    "commission_type", "commission_value",
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

  // SQLite datetime('now') stores "YYYY-MM-DD HH:MM:SS" in UTC.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const inThisMonth = (d: Deal) => (d.updated_at ?? "").slice(0, 7) === currentMonth;
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

  const yt = getPlaybook("youtube") as { maxCpmIntegration?: number; monthlyCap?: number } | null;

  return {
    activeDeals: active.length,
    waitingOnYou: active.filter((d) => d.your_move === 1).length,
    committed,
    monthlyCap: yt?.monthlyCap ?? 25000,
    avgClosedCpm,
    targetCpm: yt?.maxCpmIntegration ?? 28,
    savedVsFirstAsk,
  };
}

export default db;
