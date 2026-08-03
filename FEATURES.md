# Counterpart — Features & Screens

An influencer-negotiation and delivery copilot. It takes a creator from first contact
through analysis, negotiation, contract, production, publication, verification and
payment — and calibrates its own advice against what actually closed.

> **This file is the map of the product.** Anything added, removed or materially changed
> in the app must be reflected here in the same change. See [Maintaining this file](#maintaining-this-file).

---

## Navigation

The sidebar splits into two groups, because they are two different kinds of thing.

**Work** — opened many times a day, in the order a deal moves through them:

| | Screen | Route | One line |
|---|---|---|---|
| 1 | [Dashboard](#dashboard) | `/` | What needs you today |
| 2 | [Pipeline](#pipeline) | `/pipeline` | Every deal and where it stands |
| 3 | [Content](#content) | `/content` | Every deliverable and what it is waiting on |
| 4 | [Partners](#partners) | `/partners` | Every creator, what they're worth, whether they're set up |
| 5 | [Payments](#payments) | `/payments` | Everything owed across deals |

**Setup** — visited occasionally; these change how the work screens behave:

| Screen | Route | One line |
|---|---|---|
| [Playbook](#playbook) | `/playbook` | The rules the engine negotiates by |
| [Benchmarks](#benchmarks) | `/benchmarks` | Predicted vs actual, calibrated from closed deals |
| [Settings](#settings) | `/settings` | Environment, model, API spend |

There is deliberately **no "Deals" entry** — Pipeline is the deals home, and `/deals`
redirects into it.

---

## Screens

### Dashboard
`/` — *What needs you today*

Four KPI cards (active deals, committed vs monthly cap, owed to creators, average closed
CPM), the attention panel, recent activity, and pipeline stage counts.

**Needs your attention** is the app's single consolidated worklist. It is *computed from
data*, never maintained by hand, and spans every domain:

- Reminders you set yourself, once their date arrives
- Draft requests (T-minus the draft deadline), draft reviews, overdue content, content
  due within 7 days, and content whose views have settled enough to measure
- Payments ready to approve
- Product not sent, and shipments stuck in transit
- Blocking onboarding steps a deal has already outrun
- Silent negotiations, verdicts nobody acted on, your move, stale leads
- Declined deals whose revisit date has arrived, and deals ready to wrap up

Items are **grouped** — Content, Money, Setup & delivery, Negotiation, Follow-ups —
ordered by whatever is most urgent rather than a fixed menu, so grouping can never bury a
critical item. Each item carries an **owner**: things that are somebody else's move are
tagged `chase`, and the header states `N to do · N to chase`.

### Pipeline
`/pipeline` — *Every deal and where it stands*

Board and list views over all deals.

- **Board** — drag-and-drop kanban across the deal stages (lead → contacted → analyzing →
  offer sent → negotiating → agreed → completed). Declined deals are not a column, but
  stay reachable via a link beneath the board.
- **List** — sortable table with their ask, our number, status and last activity.
- Filters: platform, stage, campaign, free-text search.

Signed deals show a **phase** rather than a stage — "Producing 2/3", "Payment to approve",
"Ready to wrap" — because a deal is routinely mid-onboarding *and* mid-production *and*
awaiting payment at once. A `behind` note names anything earlier that was skipped over.

### Content
`/content` — *Every deliverable and what it is waiting on*

Three views over every content item across every deal. The six columns are the contract
review loop: **planned → in production → submitted → approved → posted → verified**.

- **Board** — one card per deliverable, grouped by status, ordered by urgency within each
  column. Deliberately *not* drag-and-drop: these statuses are not interchangeable labels,
  and a card dropped into "verified" would skip draft review and can release money.
- **List** — sortable table adding campaign, who is holding it up, and days waiting.
- **Calendar** — month grid keyed on publish date (the *real* one once posted), with draft
  deadlines drawn as dashed outlines. Flags **spacing clashes**: the same creator
  publishing twice inside the minimum gap, reported as clusters rather than pairs.

Each card carries **exactly one next action** and names its owner — a card offering three
buttons is a status display; a card offering one is a worklist.

| Situation | Action | Owner |
|---|---|---|
| Product not sent / in transit | Product not sent yet · Product in transit | us · nobody |
| Tracking setup missing, filming started | Blocked: tracking link and coupon code | us |
| No publish date | inline date picker → **Set** | us |
| Draft deadline passed | Draft is due — chase it | creator |
| Draft submitted | Review the draft | us |
| Approved | Waiting to go live + **Mark posted** | creator |
| Posted, unchecked | Run integration check | us |
| Verified, no numbers | Log the results | us |

The **needs attention** filter counts three distinct failures, because each is fixed
differently: a date nobody set, a deadline nobody met, and a draft nobody reviewed.

### Partners
`/partners` — *Every creator you've worked with, and what each one is worth*

Table of all creators with lifecycle status (Prospect / In negotiation / Delivering /
Worked with / Lapsed), **setup status**, channels, deal count, committed, paid, actual CPM
and savings vs their first ask. Sortable, searchable, filterable by status.

**Setup** reads the onboarding checklist, which is partner-scoped by design: `Ready`,
`N/M done`, or `No tracking link` in red. "Blocked" is kept distinct from merely
in-progress — an outstanding welcome email is a courtesy; an outstanding tracking link
makes every result unattributable. A filter pill surfaces creators missing tracking setup.

`/partners/[id]` — profile with contact and legal details, per-platform channels and their
average views, deal history, and the creator's portal link (copied as a full URL — the
same contact strip the deal's Fulfillment tab carries).

### Payments
`/payments` — *Everything owed across deals*

Queue of every payment item with four status KPIs (ready to approve, approved-unpaid, not
yet earned, paid). Filter by status, creator and date range; sort by amount, creator or
date. **CSV export** respects the active filters (`/payments/export`).

Payment status is derived, not typed: a payment becomes approvable when its trigger is
satisfied — on signing, on product delivery, on content verification (all linked items, or
a milestone count like "50% after the first two videos"), or on a date.

### Playbook
`/playbook` — *Your rules — every number and every draft traces back to this page*

The rules the negotiation engine reasons with:

- **Per-platform rules** — minimum average views, minimum engagement, maximum fake
  followers, minimum audience geo share, target CPM, maximum per deal
- **Global rules**, **unit economics**, **brand profile**, **negotiation style**
- **Campaigns** — named budgets with per-campaign overrides layered on top of the platform
  rules, plus spend-to-date
- **Campaign briefs** — upload a brief; Claude extracts the checkable requirements
  (required mentions, disclosures, prohibited claims, minimum integration length), which
  are then editable by hand

### Benchmarks
`/benchmarks` — *Calibrated from your closed deals*

Win rate, predicted vs actual reach and CPM per closed deal, and real average CPM by
platform. Results measured before the platform's views had settled are shown but
**excluded from the averages**, so a provisional number can't drag the calibration.

### Settings
`/settings`

API key status, active model, database location and deal count, currency, and cumulative
API usage with an estimated cost (including tokens served from cache at a tenth of input
price).

---

### New deal
`/new`

Creator name, platform(s), deliverables, campaign, stage, their opening message, and an
optional analytics report (PDF or screenshot). Looking up an existing partner prefills
what's known. Creating a deal kicks off analysis in the background.

### Deal workspace
`/deals/[id]`

A sticky app bar carrying the breadcrumb, tab strip and deal actions; below it the
always-visible **cockpit** (anchor, target, walk-away, breakeven; total deal cost;
affordability) and the **metric band** (average views, engagement, audience geo, followers,
fake-follower share, view trend — each graded against the playbook with a reason).

| Tab | What it holds |
|---|---|
| **Analysis** | Verdict (accept / negotiate / decline), reasoning, red flags, the numbers behind them, audience-data editor |
| **Negotiation** | Round-by-round thread, the Copilot's recommendation with a single ready-to-send draft, on-demand tone rewrite, reply capture |
| **Fulfillment** *(signed deals)* | Contact strip (creator email + copyable portal URL), contract upload and parsing, generated contract draft, onboarding checklist with a generated welcome email, content items with the draft review loop and per-item nudge emails, integration check, product delivery, payments |
| **Actuals** *(delivered deals)* | Per-item views, clicks, orders and revenue, with the measurement window state |
| **History** | Every model call for this deal: kind, model, tokens, cache reads, cost |

Deal-level actions: run analysis, generate offer, regenerate recommendation, decline (with
reason and revisit date), reopen, complete, delete, and free-text notes.

### Creator portal *(public, unguessable token)*
`/portal/[token]`

What the creator sees. No login. Lists their content with due dates, product delivery
status, and payments. They can **submit a draft URL** (which moves the item to *submitted*
and bumps the revision round), **submit the live URL** once posted, and fill in their
**legal details** for the contract.

`/portal/[token]/brief/[campaignId]` downloads the campaign brief.

### Shipping address form *(public, unguessable token)*
`/ship/[token]`

A single-purpose form for the creator to supply their delivery name, address and phone,
so addresses are never collected over email.

---

## How the features connect

This is the part that has to keep working. Each arrow is a real dependency in code.

**Playbook → every number.** Platform rules, global rules, unit economics, brand profile
and negotiation style are assembled per deal (`playbookContext`) and passed into both
analysis and recommendation. Campaign overrides layer on top. Change the playbook and every
subsequent verdict, ladder and draft changes with it.

**Contract confirmed → the whole delivery plan.** Confirming a parsed contract generates
its content items (inheriting the deal's platform when unambiguous), payment items with
their triggers, a shipment if a product is involved, and seeds the onboarding checklist —
carrying over anything a returning creator already completed.

**Onboarding → content.** Unfinished *blocking* steps (tracking link, coupon code) mark
content as blocked once filming has started, appear as the `Setup` column on Partners, and
raise a dashboard item that escalates when content is already in production. On a posted
item the block becomes a flag rather than an action — the link cannot be applied
retroactively, but it still explains why the numbers will never arrive.

**Shipment → content.** An undelivered product blocks *planned* content and makes it our
move, not the creator's — they cannot film what has not arrived. Marking a shipment
delivered resolves every `+N days after delivery` rule into a real publish date, which in
turn activates draft deadlines, overdue checks and the calendar.

**Content → payments.** Verifying content re-evaluates every payment held against it;
milestone gates release partially. Nothing here is typed by hand.

**Content → integration check → change request.** A posted video can be uploaded and
transcribed, then checked against the campaign brief's requirements. Failed findings
generate an editable change-request email, worded differently depending on whether the
video is still a draft or already live.

**Content → actuals → benchmarks → playbook.** Per-item results roll up to the deal, which
feeds partner stats and the benchmark page, which is what tells you whether your playbook's
target CPM is realistic. Measurement windows decide when a number is worth reading and
whether it counts toward the averages.

**Portal → your worklist.** A creator submitting a draft moves the item to *submitted*,
which puts it on your board and in the attention panel with a review clock running from
submission — not from when you happen to open the deal.

**Worklist → an email in hand.** Every journey that ends "contact the creator" lands on
the Fulfillment tab, which carries the creator's email and copyable portal URL, and
generates the message itself: a per-item **nudge** whose wording follows the item's actual
state (draft coming due → heads-up; deadline passed → buffer warning; slot missed →
renegotiate the date, blame-free; approved but not live → "when is it going up"), and a
**welcome email** behind the onboarding checklist's email step that includes only the
setup that exists — an unissued coupon is omitted, never rendered as a blank. All
deterministic like the change-request email: instant, editable, copied never sent. Portal
URLs are assembled client-side from the browser's origin, because a copied relative path
is a broken link.

**Everything → the attention panel.** Every domain above contributes; grouping and owner
tagging keep it readable as it grows.

**Deal stage gates behaviour.** The Fulfillment tab, draft-request rules and onboarding
warnings only apply to `agreed` deals — an unsigned deal has no delivery obligations.

**Writes fan out.** Any write must revalidate every screen that reads what it changed, not
just the one it was made from. Mutating content, payments, shipments or onboarding
refreshes the deal page, Dashboard, Pipeline, Content, Payments, Partners and Benchmarks
together. Writes made from *outside* the app — a creator submitting a draft or a live URL
through the portal — refresh the same content surfaces, because a draft that only appears
on one deal page is a draft nobody knows arrived. So does the integration check, whose
result is what flips a card from "run the check" to "log the results".

**Known asymmetry.** The deal page's Fulfillment tab lists content without the
blocked/awaiting-product markers the Content board shows. It is defensible there — the
onboarding checklist and the product-delivery block are on the same screen, a few
centimetres away — but the two views of the same row do read differently.

---

## Data model

| Table | Holds |
|---|---|
| `deals` | The negotiation: stage, asks, offers, ladder numbers, audience metrics, analysis, decline/revisit, actuals |
| `partners` / `partner_channels` | Creators, legal details, portal token, per-platform average views |
| `messages` | The negotiation thread, including Copilot recommendations |
| `campaigns` | Named budgets, per-campaign playbook overrides, brief and its extracted requirements |
| `playbook` / `settings` | Per-platform rules; global rules, unit economics, brand profile, negotiation style, onboarding template, measurement windows |
| `contracts` / `contract_drafts` | Uploaded contracts and their parsed terms; generated drafts until signed |
| `content_items` | Deliverables: status, dates, draft/approval/posted URLs, revision round, transcript, check result, actuals |
| `onboarding_tasks` | Setup checklist, partner- or deal-scoped |
| `shipments` | Product delivery, address token, carrier and tracking |
| `payment_items` | Amounts, triggers, linked content, status |
| `reminders` | Your own follow-ups |
| `usage_log` | Every model call: kind, model, tokens, cache reads and writes |

---

## AI usage

| Purpose | Model | Notes |
|---|---|---|
| Analysis, recommendation, contract & brief parsing, integration check | `claude-opus-5` | Adaptive thinking, high effort, streamed, prompt caching on the large prefix |
| Report/screenshot extraction | `claude-haiku-4-5` | OCR-grade transcription only — no judgement is made here |
| Tone rewrite of a finished draft | `claude-opus-5` | Narrow, low effort |
| Video transcription | fal.ai Whisper | Word-level timestamps, brand names primed |

Extraction runs first and cheaply; if its output is unusable the analysis falls back to the
raw document rather than reasoning over numbers nobody can vouch for. Every figure it
extracts carries the source text it was read from, so a mis-mapping is visible in the
prompt. Costs are logged per call and totalled in Settings.

Environment: `ANTHROPIC_API_KEY`, optional `COUNTERPART_MODEL` / `COUNTERPART_EXTRACT_MODEL`
overrides, and `FAL_KEY` for transcription.

---

## Conventions and constraints

- **All money is USD**, everywhere.
- **Emails are generated, never sent.** Every generated email is editable and copyable in
  the app; sending happens in your own mail client.
- **Contracts stay editable until signed.**
- **The audience discount code is excluded** from deal-cost totals.
- Guards catch *impossible* values, not merely wrong ones — the defence against wrong ones
  is fields that cannot be filled ambiguously, such as provenance snippets.
- Pure logic lives in `src/lib/*.ts` without `server-only`, so it can be unit-tested;
  database access is confined to `db.ts` and `fulfillment.ts`.

---

## Maintaining this file

**Whenever the app gains, loses or materially changes a feature or screen, update this file
in the same change.** Specifically:

1. Add or amend the screen's section, and its row in the [Navigation](#navigation) table if
   it is a new route.
2. If the change creates a dependency between two features, add it to
   [How the features connect](#how-the-features-connect) — that section is the one that
   catches integration bugs, and it is only useful if it is complete.
3. If it adds a table, column, setting or environment variable, update
   [Data model](#data-model) or [AI usage](#ai-usage).
4. Re-read [How the features connect](#how-the-features-connect) before finishing and check
   the new feature against it: anything that gates, blocks, releases or recomputes another
   feature belongs there, and anything that *should* have been wired up but wasn't is worth
   raising.
