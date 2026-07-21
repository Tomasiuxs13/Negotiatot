/**
 * Seeds realistic demo data covering every state the app can show: leads, live
 * negotiations, signed contracts, content mid-delivery, shipments in transit,
 * payments at each stage, and closed deals with actuals feeding Benchmarks.
 *
 * Safe to re-run: it removes anything it previously created (by creator name)
 * before inserting, and never touches deals it didn't make.
 *
 *   node scripts/seed-demo.mjs
 */
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(here, "..", "data", "counterpart.db"));

const TODAY = new Date();
const day = (offset) => {
  const d = new Date(TODAY.getTime() + offset * 86400000);
  return d.toISOString().slice(0, 10);
};
const stamp = (offset) => `${day(offset)} 10:00:00`;

/** Creators this script owns — wiped and recreated on every run. */
const DEMO_CREATORS = [
  "NordicNiklas",
  "StudioSanne",
  "PixelPeter",
  "GamerGitta",
  "HomeWithHanna",
  "ReiseRobin",
];

console.log("Clearing previous demo data…");
const clearDeal = db.prepare("SELECT id FROM deals WHERE creator = ?");
for (const name of DEMO_CREATORS) {
  for (const { id } of clearDeal.all(name)) {
    for (const table of ["content_items", "payment_items", "shipments", "contracts", "messages"]) {
      db.prepare(`DELETE FROM ${table} WHERE deal_id = ?`).run(id);
    }
    db.prepare("DELETE FROM deals WHERE id = ?").run(id);
  }
  const partner = db.prepare("SELECT id FROM partners WHERE name = ?").get(name);
  if (partner) {
    db.prepare("DELETE FROM partner_channels WHERE partner_id = ?").run(partner.id);
    db.prepare("DELETE FROM partners WHERE id = ?").run(partner.id);
  }
}

/* ------------------------------------------------------------------ helpers */

function addPartner({ name, email, tags, notes, channels }) {
  const id = Number(
    db
      .prepare("INSERT INTO partners (name, email, tags, notes) VALUES (?, ?, ?, ?)")
      .run(name, email ?? null, JSON.stringify(tags ?? []), notes ?? null).lastInsertRowid
  );
  for (const c of channels ?? []) {
    db.prepare(
      `INSERT INTO partner_channels (partner_id, platform, handle, url, followers, avg_views, engagement_rate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, c.platform, c.handle ?? null, c.url ?? null, c.followers ?? null, c.avgViews ?? null, c.er ?? null);
  }
  return id;
}

function addDeal(fields) {
  const cols = {
    creator: fields.creator,
    platform: fields.platforms[0],
    platforms: JSON.stringify(fields.platforms),
    deliverables: fields.deliverables ?? null,
    campaign: fields.campaign ?? null,
    partner_id: fields.partnerId,
    stage: fields.stage,
    deal_type: fields.dealType ?? null,
    round: fields.round ?? 0,
    your_move: fields.yourMove ?? 0,
    first_ask: fields.firstAsk ?? null,
    current_ask: fields.currentAsk ?? fields.firstAsk ?? null,
    current_offer: fields.currentOffer ?? null,
    agreed_price: fields.agreedPrice ?? null,
    anchor: fields.anchor ?? null,
    target: fields.target ?? null,
    walkaway: fields.walkaway ?? null,
    breakeven: fields.breakeven ?? null,
    avg_views: fields.avgViews ?? null,
    engagement_rate: fields.er ?? null,
    status_label: fields.statusLabel ?? null,
    status_tone: fields.statusTone ?? "neutral",
    actual_views: fields.actualViews ?? null,
    actual_clicks: fields.actualClicks ?? null,
    actual_orders: fields.actualOrders ?? null,
    actual_revenue: fields.actualRevenue ?? null,
    actuals_logged_at: fields.actualsLoggedAt ?? null,
    updated_at: fields.updatedAt ?? stamp(0),
  };
  const keys = Object.keys(cols);
  const id = Number(
    db
      .prepare(
        `INSERT INTO deals (${keys.join(", ")}) VALUES (${keys.map((k) => "@" + k).join(", ")})`
      )
      .run(cols).lastInsertRowid
  );
  return id;
}

function addContract(dealId, partnerId, terms, signedAt) {
  db.prepare(
    `INSERT INTO contracts (deal_id, filename, file_path, mime, parsed_terms, status, signed_at)
     VALUES (?, ?, ?, 'application/pdf', ?, 'confirmed', ?)`
  ).run(dealId, `${terms.brand ?? "agreement"}.pdf`, `contracts/demo/deal-${dealId}.pdf`, JSON.stringify(terms), signedAt);
}

function addContent(dealId, partnerId, items) {
  const ids = [];
  for (const it of items) {
    ids.push(
      Number(
        db
          .prepare(
            `INSERT INTO content_items (deal_id, title, platform, due_date, due_days_after_delivery, status, posted_url,
                                        posted_at, actuals_measured_at,
                                        actual_views, actual_clicks, actual_orders, actual_revenue)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            dealId,
            it.title,
            it.platform ?? null,
            it.due ?? null,
            it.afterDelivery ?? null,
            it.status,
            it.url ?? null,
            it.postedAt ?? null,
            it.measuredAt ?? null,
            it.views ?? null,
            it.clicks ?? null,
            it.orders ?? null,
            it.revenue ?? null
          ).lastInsertRowid
      )
    );
  }
  return ids;
}

function addPayment(dealId, partnerId, p) {
  db.prepare(
    `INSERT INTO payment_items (deal_id, description, amount, trigger, linked_content_ids, status, approved_at, paid_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dealId,
    p.description,
    p.amount,
    p.trigger,
    JSON.stringify(p.linked ?? []),
    p.status,
    p.approvedAt ?? null,
    p.paidAt ?? null
  );
}

function addShipment(dealId, partnerId, s) {
  db.prepare(
    `INSERT INTO shipments (deal_id, product, value, address, carrier, tracking, status, shipped_at, delivered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    dealId,
    s.product,
    s.value ?? null,
    s.address ?? null,
    s.carrier ?? null,
    s.tracking ?? null,
    s.status,
    s.shippedAt ?? null,
    s.deliveredAt ?? null
  );
}

/* -------------------------------------------------------------- the fixtures */

console.log("Seeding demo deals…");

/* 1. NordicNiklas — mid-flight fulfillment: product delivered, one item verified,
      one posted, one OVERDUE. Final payment still waiting on verification. */
{
  const partnerId = addPartner({
    name: "NordicNiklas",
    email: "niklas@nordicreviews.de",
    tags: ["tech", "DACH", "long-form"],
    notes: "Replies fast, always asks for usage rights to be time-boxed. Prefers product 2 weeks early.",
    channels: [
      { platform: "youtube", handle: "@nordicniklas", url: "https://youtube.com/@nordicniklas", followers: 210000, avgViews: 88000, er: 4.6 },
      { platform: "instagram", handle: "@nordicniklas", followers: 54000, avgViews: 21000, er: 3.8 },
    ],
  });
  const dealId = addDeal({
    creator: "NordicNiklas",
    partnerId,
    platforms: ["youtube", "instagram"],
    deliverables: "1× YouTube integration + 2× IG stories",
    campaign: "Q3 DACH launch",
    stage: "agreed",
    dealType: "gifted_plus_paid",
    round: 3,
    firstAsk: 3200,
    currentAsk: 2600,
    currentOffer: 2450,
    agreedPrice: 2450,
    anchor: 2100,
    target: 2400,
    walkaway: 2650,
    breakeven: 3100,
    avgViews: 88000,
    er: 4.6,
    statusLabel: "Contract confirmed",
    statusTone: "good",
    updatedAt: stamp(-6),
  });
  addContract(
    dealId,
    partnerId,
    {
      brand: "nordicgear-niklas-agreement",
      deliverables: [
        { description: "YouTube integration, 60–90s", platform: "youtube", quantity: 1, dueDate: null, dueDaysAfterDelivery: 14, dueRule: null },
        { description: "Instagram story with link", platform: "instagram", quantity: 2, dueDate: null, dueDaysAfterDelivery: null, dueRule: "Day the video goes live" },
      ],
      payments: [
        { description: "Advance on signing", amount: 950, trigger: "on_signing", dueDate: null },
        { description: "Balance on verified publication", amount: 1500, trigger: "on_verification", dueDate: null },
      ],
      product: { description: "NordicGear Alpha 3 headset", value: 349 },
      usageRights: "Paid ads, 60 days from publication",
      exclusivity: "No competing audio brands for 30 days",
      paymentTerms: "Net-30",
      totalFee: 2450,
      notes: ["One round of review before publication."],
    },
    day(-12)
  );
  const content = addContent(dealId, partnerId, [
    { title: "YouTube integration, 60–90s", platform: "youtube", due: day(-4), status: "planned" }, // OVERDUE
    { title: "Instagram story with link (1/2)", platform: "instagram", due: day(3), status: "posted", url: "https://instagram.com/stories/nordicniklas/1", postedAt: day(-16) },
    { title: "Instagram story with link (2/2)", platform: "instagram", due: day(3), status: "verified", url: "https://instagram.com/stories/nordicniklas/2", postedAt: day(-3), measuredAt: day(-1), views: 9000, clicks: 120, orders: 4, revenue: 480 },
  ]);
  addShipment(dealId, partnerId, {
    product: "NordicGear Alpha 3 headset",
    value: 349,
    address: "Niklas Berg, Hauptstr. 14, 10827 Berlin",
    carrier: "DHL",
    tracking: "JJD0099887766",
    status: "delivered",
    shippedAt: stamp(-11),
    deliveredAt: stamp(-9),
  });
  addPayment(dealId, partnerId, { description: "Advance on signing", amount: 950, trigger: "on_signing", status: "paid", approvedAt: stamp(-11), paidAt: stamp(-10) });
  addPayment(dealId, partnerId, { description: "Balance on verified publication", amount: 1500, trigger: "on_verification", linked: content, status: "pending" });
  console.log("  ✓ NordicNiklas — overdue content, product delivered, balance pending");
}

/* 1b. NordicNiklas, round two — the same partner, a second collaboration. This is what
       the partner record is for: the Copilot negotiates knowing what you paid in spring,
       and what that money actually delivered. */
{
  const partnerId = db.prepare("SELECT id FROM partners WHERE name = 'NordicNiklas'").get().id;
  const dealId = addDeal({
    creator: "NordicNiklas",
    partnerId,
    platforms: ["youtube"],
    deliverables: "1× YouTube integration",
    campaign: "Spring hardware push",
    stage: "completed",
    dealType: "paid",
    round: 2,
    firstAsk: 2400,
    currentAsk: 2200,
    currentOffer: 2100,
    agreedPrice: 2100,
    anchor: 1800,
    target: 2050,
    walkaway: 2300,
    breakeven: 2900,
    avgViews: 88000,
    er: 4.6,
    statusLabel: "Completed",
    statusTone: "good",
    updatedAt: stamp(-95),
  });
  const content = addContent(dealId, partnerId, [
    {
      title: "YouTube integration (spring)",
      platform: "youtube",
      due: day(-110),
      status: "verified",
      url: "https://youtube.com/watch?v=niklas-spring",
      postedAt: day(-110),
      measuredAt: day(-75),
      views: 71000,
      clicks: 910,
      orders: 28,
      revenue: 3360,
    },
  ]);
  addPayment(dealId, partnerId, {
    description: "Full fee",
    amount: 2100,
    trigger: "on_verification",
    linked: content,
    status: "paid",
    approvedAt: stamp(-108),
    paidAt: stamp(-100),
  });
  db.prepare(
    `UPDATE deals SET actual_views = 71000, actual_clicks = 910, actual_orders = 28,
       actual_revenue = 3360, actuals_logged_at = ? WHERE id = ?`
  ).run(stamp(-98), dealId);
  console.log("  ✓ NordicNiklas (2nd deal) — completed in spring, gives the Copilot history");
}

/* 2. HomeWithHanna — everything delivered and verified: payment READY TO APPROVE. */
{
  const partnerId = addPartner({
    name: "HomeWithHanna",
    email: "hanna@homewithhanna.at",
    tags: ["home", "AT", "reels"],
    notes: "Very reliable on deadlines. Flat fee only — refuses performance bonuses.",
    channels: [{ platform: "instagram", handle: "@homewithhanna", url: "https://instagram.com/homewithhanna", followers: 96000, avgViews: 41000, er: 5.4 }],
  });
  const dealId = addDeal({
    creator: "HomeWithHanna",
    partnerId,
    platforms: ["instagram"],
    deliverables: "2× IG reels",
    campaign: "Q3 DACH launch",
    stage: "agreed",
    dealType: "paid",
    round: 2,
    firstAsk: 1400,
    currentAsk: 1200,
    currentOffer: 1150,
    agreedPrice: 1150,
    anchor: 950,
    target: 1100,
    walkaway: 1250,
    breakeven: 1600,
    avgViews: 41000,
    er: 5.4,
    statusLabel: "Content verified · payment ready",
    statusTone: "good",
    updatedAt: stamp(-2),
  });
  addContract(
    dealId,
    partnerId,
    {
      brand: "homewithhanna-agreement",
      deliverables: [{ description: "Instagram reel", platform: "instagram", quantity: 2, dueDate: day(-5), dueDaysAfterDelivery: null, dueRule: null }],
      payments: [{ description: "Full fee after publication", amount: 1150, trigger: "on_verification", dueDate: null }],
      product: null,
      usageRights: "Organic only",
      exclusivity: null,
      paymentTerms: "Net-30",
      totalFee: 1150,
      notes: [],
    },
    day(-20)
  );
  const content = addContent(dealId, partnerId, [
    { title: "Instagram reel (1/2)", platform: "instagram", due: day(-8), status: "verified", url: "https://instagram.com/reel/hanna1", postedAt: day(-8) },
    { title: "Instagram reel (2/2)", platform: "instagram", due: day(-5), status: "verified", url: "https://instagram.com/reel/hanna2", postedAt: day(-5) },
  ]);
  addPayment(dealId, partnerId, { description: "Full fee after publication", amount: 1150, trigger: "on_verification", linked: content, status: "approvable" });
  console.log("  ✓ HomeWithHanna — all verified, €1,150 ready to approve");
}

/* 3. GamerGitta — signed, but the product hasn't gone out yet. */
{
  const partnerId = addPartner({
    name: "GamerGitta",
    email: "gitta@gittaplays.com",
    tags: ["gaming", "DACH"],
    notes: "Wants product 3 weeks before filming. Asks for a promo code for her audience.",
    channels: [
      { platform: "youtube", handle: "@gittaplays", url: "https://youtube.com/@gittaplays", followers: 175000, avgViews: 64000, er: 6.1 },
      { platform: "tiktok", handle: "@gittaplays", followers: 240000, avgViews: 130000, er: 7.2 },
    ],
  });
  const dealId = addDeal({
    creator: "GamerGitta",
    partnerId,
    platforms: ["youtube", "tiktok"],
    deliverables: "1× YouTube dedicated + 2× TikToks",
    campaign: "Q3 DACH launch",
    stage: "agreed",
    dealType: "gifted_plus_paid",
    round: 2,
    firstAsk: 3400,
    currentAsk: 2900,
    currentOffer: 2800,
    agreedPrice: 2800,
    anchor: 2300,
    target: 2700,
    walkaway: 3000,
    breakeven: 3900,
    avgViews: 64000,
    er: 6.1,
    statusLabel: "Product not sent",
    statusTone: "warn",
    updatedAt: stamp(-3),
  });
  addContract(
    dealId,
    partnerId,
    {
      brand: "gamergitta-agreement",
      deliverables: [
        { description: "YouTube dedicated video", platform: "youtube", quantity: 1, dueDate: null, dueDaysAfterDelivery: 21, dueRule: null },
        { description: "TikTok short", platform: "tiktok", quantity: 2, dueDate: null, dueDaysAfterDelivery: 21, dueRule: null },
      ],
      payments: [
        { description: "50% on signing", amount: 1400, trigger: "on_signing", dueDate: null },
        { description: "50% on verified publication", amount: 1400, trigger: "on_verification", dueDate: null },
      ],
      product: { description: "NordicGear Pro keyboard + headset bundle", value: 520 },
      usageRights: "Paid ads, 90 days",
      exclusivity: "No competing peripherals for 45 days",
      paymentTerms: "Net-30",
      totalFee: 2800,
      notes: ["Creator requested a 10% audience promo code."],
    },
    day(-3)
  );
  const content = addContent(dealId, partnerId, [
    { title: "YouTube dedicated video", platform: "youtube", afterDelivery: 21, status: "planned" },
    { title: "TikTok short (1/2)", platform: "tiktok", afterDelivery: 21, status: "planned" },
    { title: "TikTok short (2/2)", platform: "tiktok", afterDelivery: 21, status: "planned" },
  ]);
  addShipment(dealId, partnerId, {
    product: "NordicGear Pro keyboard + headset bundle",
    value: 520,
    address: "Gitta Mayer, Ringstr. 8, 1010 Wien",
    status: "to_prepare",
  });
  addPayment(dealId, partnerId, { description: "50% on signing", amount: 1400, trigger: "on_signing", status: "approved", approvedAt: stamp(-3) });
  addPayment(dealId, partnerId, { description: "50% on verified publication", amount: 1400, trigger: "on_verification", linked: content, status: "pending" });
  console.log("  ✓ GamerGitta — product to prepare, €1,400 approved awaiting payment");
}

/* 4. StudioSanne — reached out, waiting on a reply. */
{
  const partnerId = addPartner({
    name: "StudioSanne",
    email: "hello@studiosanne.nl",
    tags: ["design", "NL"],
    channels: [{ platform: "instagram", handle: "@studiosanne", url: "https://instagram.com/studiosanne", followers: 62000, avgViews: 18000, er: 4.1 }],
  });
  addDeal({
    creator: "StudioSanne",
    partnerId,
    platforms: ["instagram"],
    deliverables: "1× reel + 1× story",
    campaign: "Q3 DACH launch",
    stage: "contacted",
    statusLabel: "Reached out · awaiting reply",
    avgViews: 18000,
    er: 4.1,
    updatedAt: stamp(-2),
  });
  console.log("  ✓ StudioSanne — contacted 2 days ago");
}

/* 5. PixelPeter — a lead nobody has touched in over a week. */
{
  const partnerId = addPartner({
    name: "PixelPeter",
    email: null,
    tags: ["tech", "review"],
    notes: "Found via competitor's sponsored video. No contact details yet.",
    channels: [{ platform: "youtube", handle: "@pixelpeter", url: "https://youtube.com/@pixelpeter", followers: 88000, avgViews: 32000 }],
  });
  addDeal({
    creator: "PixelPeter",
    partnerId,
    platforms: ["youtube"],
    deliverables: "1× integration",
    stage: "lead",
    statusLabel: "New lead",
    avgViews: 32000,
    updatedAt: stamp(-11),
  });
  console.log("  ✓ PixelPeter — stale lead (11 days)");
}

/* 5b. ReiseRobin — a finished multi-platform bundle with per-deliverable results, so
       Benchmarks can calibrate YouTube and TikTok separately from one deal. */
{
  const partnerId = addPartner({
    name: "ReiseRobin",
    email: "robin@reiserobin.de",
    tags: ["travel", "DACH", "bundle"],
    notes: "Bundles well — quotes YouTube + TikTok together and discounts the pair.",
    channels: [
      { platform: "youtube", handle: "@reiserobin", url: "https://youtube.com/@reiserobin", followers: 143000, avgViews: 52000, er: 5.2 },
      { platform: "tiktok", handle: "@reiserobin", followers: 310000, avgViews: 145000, er: 8.4 },
    ],
  });
  const dealId = addDeal({
    creator: "ReiseRobin",
    partnerId,
    platforms: ["youtube", "tiktok"],
    deliverables: "1× YouTube integration + 2× TikToks",
    campaign: "Q3 DACH launch",
    stage: "completed",
    dealType: "paid",
    round: 2,
    firstAsk: 3000,
    currentAsk: 2500,
    currentOffer: 2400,
    agreedPrice: 2400,
    anchor: 2000,
    target: 2300,
    walkaway: 2600,
    breakeven: 3400,
    avgViews: 52000,
    er: 5.2,
    statusLabel: "Completed",
    statusTone: "good",
    updatedAt: stamp(-8),
  });
  addContract(
    dealId,
    partnerId,
    {
      brand: "reiserobin-agreement",
      deliverables: [
        { description: "YouTube integration", platform: "youtube", quantity: 1, dueDate: day(-30), dueDaysAfterDelivery: null, dueRule: null },
        { description: "TikTok short", platform: "tiktok", quantity: 2, dueDate: day(-28), dueDaysAfterDelivery: null, dueRule: null },
      ],
      payments: [{ description: "Full fee", amount: 2400, trigger: "on_verification", dueDate: null }],
      product: null,
      usageRights: "Organic + paid, 30 days",
      exclusivity: null,
      paymentTerms: "Net-30",
      totalFee: 2400,
      notes: [],
    },
    day(-40)
  );
  // The TikToks out-delivered the video 2:1 — the reason a single blended number lies.
  const content = addContent(dealId, partnerId, [
    { title: "YouTube integration", platform: "youtube", due: day(-30), status: "verified", url: "https://youtube.com/watch?v=robin1", postedAt: day(-30), measuredAt: day(-2), views: 58000, clicks: 690, orders: 21, revenue: 2520 },
    { title: "TikTok short (1/2)", platform: "tiktok", due: day(-28), status: "verified", url: "https://tiktok.com/@reiserobin/1", postedAt: day(-28), measuredAt: day(-2), views: 96000, clicks: 540, orders: 14, revenue: 1680 },
    { title: "TikTok short (2/2)", platform: "tiktok", due: day(-28), status: "verified", url: "https://tiktok.com/@reiserobin/2", postedAt: day(-28), measuredAt: day(-2), views: 61000, clicks: 320, orders: 9, revenue: 1080 },
  ]);
  addPayment(dealId, partnerId, {
    description: "Full fee",
    amount: 2400,
    trigger: "on_verification",
    linked: content,
    status: "paid",
    approvedAt: stamp(-26),
    paidAt: stamp(-20),
  });
  // Deal-level totals are the roll-up of the items.
  db.prepare(
    `UPDATE deals SET actual_views = 215000, actual_clicks = 1550, actual_orders = 44,
       actual_revenue = 5280, actuals_logged_at = ? WHERE id = ?`
  ).run(stamp(-18), dealId);
  console.log("  ✓ ReiseRobin — completed YouTube+TikTok bundle with per-platform actuals");
}

/* 6. Give the existing closed deal real actuals so Benchmarks has something. */
{
  const dataDives = db.prepare("SELECT id, partner_id FROM deals WHERE creator = 'DataDives'").get();
  if (dataDives) {
    // Delivered, paid and logged — the end state of the lifecycle.
    db.prepare(
      `UPDATE deals SET actual_views = 61000, actual_clicks = 780, actual_orders = 24,
         actual_revenue = 2880, actuals_logged_at = ?, deal_type = 'paid',
         stage = 'completed', status_label = 'Completed', status_tone = 'good' WHERE id = ?`
    ).run(stamp(-4), dataDives.id);

    const existingContent = db.prepare("SELECT COUNT(*) n FROM content_items WHERE deal_id = ?").get(dataDives.id).n;
    if (existingContent === 0) {
      const content = addContent(dataDives.id, dataDives.partner_id, [
        { title: "Instagram reel", platform: "instagram", due: day(-25), status: "verified", url: "https://instagram.com/reel/datadives1" },
        { title: "Instagram story", platform: "instagram", due: day(-25), status: "verified", url: "https://instagram.com/stories/datadives1" },
      ]);
      addPayment(dataDives.id, dataDives.partner_id, {
        description: "Full fee",
        amount: 1500,
        trigger: "on_verification",
        linked: content,
        status: "paid",
        approvedAt: stamp(-22),
        paidAt: stamp(-18),
      });
    }
    console.log("  ✓ DataDives — actuals logged, payment paid (feeds Benchmarks)");
  }
}

/* 7. Make an existing offer look like it's gone quiet, to exercise the nudge. */
{
  db.prepare("UPDATE deals SET updated_at = ? WHERE creator = 'KüchenKompass'").run(stamp(-5));
  console.log("  ✓ KüchenKompass — offer sent 5 days ago, no reply");
}

console.log("\nDone. Summary:");
console.table(
  db
    .prepare(
      `SELECT stage, COUNT(*) AS deals FROM deals GROUP BY stage ORDER BY
         CASE stage WHEN 'lead' THEN 0 WHEN 'contacted' THEN 1 WHEN 'analyzing' THEN 2
                    WHEN 'offer_sent' THEN 3 WHEN 'negotiating' THEN 4 ELSE 5 END`
    )
    .all()
);
console.table(db.prepare("SELECT status, COUNT(*) AS content FROM content_items GROUP BY status").all());
console.table(db.prepare("SELECT status, COUNT(*) AS payments, SUM(amount) AS eur FROM payment_items GROUP BY status").all());
console.table(db.prepare("SELECT status, COUNT(*) AS shipments FROM shipments GROUP BY status").all());
