# Plan — CRM + Product Delivery Tracking (internal, no partner portal)

Covers roadmap Phases 1–2. Everything is manager-operated; partners never log in. All
migrations stay additive (guarded `ALTER TABLE`) so `main`'s live DB upgrades on merge.

## Three design calls

1. **Partner becomes the spine.** Today `deal.creator` is a string. A `partners` table
   becomes the entity everything hangs off (deals, contracts, content, shipments,
   payments). Existing deals are backfilled by creating a partner per distinct creator.
2. **Pre-win is dragged, post-win is computed.** The kanban gains `Lead` and `Contacted`
   columns (manual movement, as today). But after **Agreed**, a deal's status is
   *derived* from its items — onboarding done? product delivered? content overdue?
   payment approvable? Managers update items; the board updates itself. No dragging
   cards to remember state that data already knows.
3. **The contract generates the work.** Upload the signed PDF → Claude parses it into
   terms → manager confirms/edits on one screen → content items, payment items, and the
   shipment record are created from it. Nothing downstream is typed twice.

## Data model (new tables; deals gain `partner_id`, `deal_type`)

- **partners** — name, email, phone, notes, tags; `partner_channels` — platform, handle,
  url, follower/view snapshot. Partner detail page shows lifetime: deals, spend, avg
  CPM, content delivered vs promised.
- **contracts** — deal_id, partner_id, file (stored under `data/files/`), parsed terms
  JSON, status `uploaded → confirmed`, signed_at. Parsing reuses the existing PDF
  engine with a contract-specific schema (deliverables, fees + triggers, usage rights,
  exclusivity, payment terms).
- **content_items** — deal_id, partner_id, title ("YouTube integration 1/3"), platform,
  due_date *or* due-rule ("14 days after product delivered"), status
  `planned → in_production → submitted → approved → posted → verified`, posted_url, notes.
- **payment_items** — deal_id, partner_id, amount, trigger (`on_signing` /
  `on_delivery` / `on_verification` / date), linked content_item ids, status
  `pending → approvable → approved → paid`, timestamps. **Rule: a delivery-triggered
  item flips to `approvable` automatically when all linked content items are verified.**
- **shipments** — deal_id, partner_id, product description + value €, address, carrier,
  tracking, status `to_prepare → shipped → delivered`, dates. Marking *delivered*
  resolves any relative content due-rules into real dates (starts the content clock).
- **deals.deal_type** — `paid` / `gifted` / `gifted_plus_paid` (gifted = product-for-
  content, no payment items required).
- **Onboarding checklist** — JSON on the deal, seeded from a per-platform template in
  Settings when a deal hits Agreed (e.g. "send self-registration link" vs "register
  account for them" — the template encodes which platform needs which).

## Screens

- **Partners** (new nav item): list with search/tags; detail page (profile, channels,
  history, notes, "Start deal" button that pre-fills intake).
- **Pipeline**: two new columns (Lead, Contacted) at the left; Agreed column becomes the
  hand-off into fulfillment.
- **Deal workspace**: new **Fulfillment tab** (appears from Agreed): contract
  upload/parse/confirm block, onboarding checklist, content items list with status
  chips, shipment card, payment items with approve buttons.
- **Attention panel** (top of Pipeline — the streamlining centerpiece): computed daily
  worklist, no manual reminders to maintain — overdue content, content due this week,
  shipments not delivered after N days, payments awaiting approval, negotiations
  waiting on a reply longer than N days ("nudge them"). Later, the same query becomes
  an optional morning email; internal-only means no cron needed for v1.
- **Payments** (new nav item): the approval queue across all deals + CSV export for
  accounting.

## Explicitly not in scope (yet)

Partner portal & partner-facing email, e-signature (signed PDFs are uploaded, not
signed in-app), inventory management (product is free text + value), accounting
integrations (CSV export only).

## Build order (each step mergeable to main on its own)

1. Partners table + backfill + Partners pages + deal linkage.
2. Lead/Contacted stages + "Start deal from partner".
3. Contracts: upload → parse → confirm → auto-generate items.
4. Content items + shipments + delivery-clock resolution.
5. Payment items + auto-approvable rule + Payments queue.
6. Attention panel + onboarding checklist templates + Settings for both.
