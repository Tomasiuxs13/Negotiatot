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
| 2 | [Approvals](#approvals) | `/approvals` | Decisions ready for you |
| 3 | [Pipeline](#pipeline) | `/pipeline` | Every deal and where it stands |
| 4 | [Content](#content) | `/content` | Every deliverable and what it is waiting on |
| 5 | [Partners](#partners) | `/partners` | Every creator, what they're worth, whether they're set up |
| 6 | [Payments](#payments) | `/payments` | Everything owed across deals |

**Setup** — visited occasionally; these change how the work screens behave:

| Screen | Route | One line |
|---|---|---|
| [Playbook](#playbook) | `/playbook` | The rules the engine negotiates by |
| [Benchmarks](#benchmarks) | `/benchmarks` | Predicted vs actual, calibrated from closed deals |
| [Settings](#settings) | `/settings` | Environment, model, API spend |

There is deliberately **no "Deals" entry** — Pipeline is the deals home, and `/deals`
redirects into it.

On narrow screens the fixed rail becomes a compact top bar with a full navigation menu;
page padding and multi-column forms collapse at the same breakpoint.

---

## Screens

### Dashboard
`/` — *What needs you today*

Four KPI cards (active deals, committed vs monthly cap, owed to creators, average closed
CPM), the attention panel, recent activity, and pipeline stage counts.

**Needs your attention** is the app's consolidated operational worklist. It is *computed
from data*, never maintained by hand, and spans every domain:

- Reminders you set yourself, once their date arrives
- Draft requests (T-minus the draft deadline), draft reviews, overdue content, content
  due within 7 days, creator-proposed date changes awaiting approval, and content whose
  views have settled enough to measure
- Payments ready to approve
- Product not sent, and shipments stuck in transit
- Agreed deals missing a confirmed source contract, content plan, or payment schedule
- Blocking onboarding steps a deal has already outrun
- Silent negotiations, verdicts nobody acted on, your move, stale leads
- Declined deals whose revisit date has arrived, and deals ready to wrap up

Items are **grouped** — Content, Money, Setup & delivery, Negotiation, Follow-ups —
ordered by whatever is most urgent rather than a fixed menu, so grouping can never bury a
critical item. Each item carries an **owner**: things that are somebody else's move are
tagged `chase`, and the header states `N to do · N to chase`.

### Approvals
`/approvals` — *Decisions ready for you*

The manager's focused decision queue. Unlike Dashboard, it excludes work that is still
waiting on a creator and shows only cases where the evidence is ready and the manager can
act now:

- Submitted drafts and creator-proposed publication dates
- Parsed contracts awaiting source confirmation, manual contract review, and priced-rights
  discrepancies
- Payments whose trigger has been satisfied and are ready to approve
- Incomplete agreement setup and collaborations whose tracked work is ready to close

The page shows overall and per-group counts, urgent contract discrepancies, and the total
money ready for approval. Filters narrow by decision group or creator. Every card links to
the exact draft, payment, paperwork, or setup block on the deal's Fulfillment tab; the
manager does not need to search the deal after choosing the decision.

### Pipeline
`/pipeline` — *Every deal and where it stands*

Board and list views over all deals.

- **Board** — drag-and-drop kanban across the deal stages (lead → contacted → analyzing →
  offer sent → negotiating → agreed → completed). Completion is refused while tracked
  content, payments or shipments remain open; a won deal with operational records cannot
  be silently dragged back into negotiation. Add shortcuts appear only for stages the
  intake flow can actually create; critical stage changes also have in-deal buttons, so
  dragging is a convenience rather than the only path. Declined deals are not a column,
  but stay reachable via a link beneath the board.
- **List** — sortable table with their ask, our number, status and last activity.
- Filters: platform, stage, campaign, free-text search.

Signed deals show a **phase** rather than a stage — "Producing 2/3", "Payment to approve",
"Ready to wrap" — because a deal is routinely mid-onboarding *and* mid-production *and*
awaiting payment at once. A `behind` note names anything earlier that was skipped over.

### Content
`/content` — *Every deliverable and what it is waiting on*

Three views over content belonging to agreed or completed deals. The six columns are the contract
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
| Approved | Waiting to go live + **Add live URL** | creator |
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
average views, deal history, published/verified deliverables, on-time delivery rate,
average revision rounds, and the creator's portal link (copied as a full URL — the same
contact strip the deal's Fulfillment tab carries).

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
- **Global rules**, **unit economics**, **brand profile**, **negotiation style** —
  including **rights pricing bands**: what usage rights, whitelisting and exclusivity add
  to a base fee. The prose guides negotiation; editable per-30-day percentage fields feed
  the deterministic anchor, target and walk-away arithmetic. The standard offer chooses
  exactly one commission model (percentage of revenue or dollars per order); volume tiers
  can raise only a dollar-per-order rate and never replace an agreed percentage.
- **Campaigns** — named budgets with per-campaign overrides layered on top of the platform
  rules, plus spend-to-date
- **Campaign briefs** — upload a brief; Claude extracts the checkable requirements
  (required mentions, disclosures, prohibited claims, minimum integration length), which
  are then editable by hand

Saving the Playbook timestamps the rule set. A deal whose stored analysis predates that
timestamp shows a stale-analysis warning and a one-click re-analysis action.

### Benchmarks
`/benchmarks` — *Calibrated from your closed deals*

Win rate, predicted vs actual reach and CPM per closed deal, and real average CPM by
platform. Results measured before the platform's views had settled are shown but
**excluded from the averages**, so a provisional number can't drag the calibration.
ROAS here is explicitly labelled **fee ROAS**; the deal Actuals tab also shows **all-in
ROAS**, whose denominator includes actual commission and gifted product cost.

### Settings
`/settings`

API key status, active model, database location and deal count, currency, and cumulative
API usage with an estimated cost (including tokens served from cache at a tenth of input
price).

---

### New deal
`/new`

**Bulk import API** — `POST /api/deals/bulk` takes a JSON array of items shaped like the
form's fields (`creatorName`, `platform`, `email`, `stage` "lead"/"contacted", commission
and discount overriding Playbook defaults). Rows are independent — the response returns
`created` ids, per-row `errors`, and `duplicates`: creators (matched by name or email)
who already have a live deal are skipped, not doubled. Every row runs through the same
create path as the form. Analysis never runs from the import — stage "analyzing" is
refused, so a file can never silently start model runs. Unauthenticated, like the rest of
the app: local single-user use only until the deferred auth work lands.


An **On create** choice sits at the top: *Analyze now* (runs the pricing analysis),
*Outreach first* (saved as contacted — analyze when they reply, no credits spent), or
*Just track it* (a lead: a CRM row, nothing runs). The pipeline's per-column add buttons
preselect the matching mode. Then creator name, platform(s), deliverables, campaign,
their opening message, and an
optional analytics report (PDF or screenshot). Starting from a partner profile loads the
creator's name, email, platforms, primary channel URL, audience figures and operational
record on the first render; the manager can still update them for the new deal. On a
multi-platform deal the manager names
which platform the report, channel URL and audience stats belong to; those figures are not
reused for the other platforms. Looking up an existing partner prefills what's known. A
**Rights & extras** section marks usage rights (organic/paid + months),
whitelisting (+ months) and exclusivity (category/full + months + named competitors) at
intake — so the price can include them from the first analysis. Creating a deal kicks off
analysis in the background.

### Deal workspace
`/deals/[id]`

A sticky app bar carrying the breadcrumb, tab strip and deal actions; below it the
always-visible **cockpit** (anchor, target, walk-away, breakeven; total deal cost;
affordability) and the **metric band** (average views, engagement, audience geo, followers,
fake-follower share, view trend — each graded against the playbook with a reason).

| Tab | What it holds |
|---|---|
| **Analysis** | Verdict (accept / negotiate / decline), reasoning, red flags, the four numbers with the arithmetic that produced them (written by `pricing.ts`, not narrated by the model), audience-data editor |
| **Negotiation** | Round-by-round thread, the Copilot's recommendation with a single ready-to-send draft, on-demand tone rewrite, reply capture |
| **Fulfillment** *(signed deals)* | Contact strip (creator email + copyable portal URL), contract upload and parsing, generated contract draft, onboarding checklist with a generated welcome email, content items with the draft review loop and per-item nudge emails, integration check, product delivery, payments |
| **Actuals** *(delivered deals, plus legacy posted records)* | Per-item views, clicks, orders and revenue, with the measurement window state; fee-only and all-in ROAS are shown with their cost bases explained |
| **History** | Every model call for this deal: kind, model, tokens, cache reads, cost |

The always-visible rail carries the audience-data editor, **Rights & extras** (editable
from every tab, with "save & re-analyze" since rights change what the fee should be),
**Attach report** — a Modash/HypeAuditor PDF or screenshot added after intake, which
re-runs the analysis through the same extraction pipeline the intake uses (hand-corrected
views keep priority via the audience lock) — notes, and reminders.

Deal-level actions: run analysis, generate offer, regenerate recommendation, mark agreed
with confirmation, decline (with reason and revisit date), reopen, complete, delete, and
free-text notes. Marking a deal agreed immediately seeds reusable onboarding, creates an
editable contract draft, and creates provisional content items only when the requested
scope and platform attribution are unambiguous. It never invents product or payment
terms; anything still missing becomes one agreement-setup exception on the Dashboard.
Reminder title/date fields are visibly labelled.

### Creator portal *(public, unguessable token)*
`/portal/[token]`

What the creator sees. No login. Lists their content with due dates, product delivery
status, and payments. They can **submit a draft URL** (which moves the item to *submitted*
and bumps the revision round), **submit the live URL** once posted, and fill in their
**legal details** for the contract. Before publication they can propose a different date
with a reason. The existing deadline remains active until the manager approves the
proposal from Fulfillment; rejecting it keeps the current date.

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

**Playbook → the four numbers, in code.** Anchor, target, walk-away and breakeven are
computed by `pricing.computeNumbers` from each platform's own reach × its ceiling CPM ×
its attributed deliverable count, plus deterministic rights uplifts, capped by
`maxPerDeal`, with breakeven from unit economics. A report assigned to YouTube cannot
silently supply Instagram reach; a missing platform is excluded and named in the
workings. The model does not produce the numbers. It is
*given* them, and returns one bounded judgement — `qualityDiscountPct`, clamped to 50 —
which lowers target only; walk-away never moves for quality, because it is a budget
ceiling rather than a price. They are computed twice per analysis: once before the call so
the model grades against them, once after in case it researched better view figures, and
only the second computation is stored. This matters because the copilot **never drafts a
fixed fee above the lower of walk-away and breakeven** — the prompt says it, the parsed
recommendation is rejected if it does, and the send action enforces it again. That
guardrail rests on arithmetic a creator-supplied document cannot reach. See the note at
the top of `pricing.ts` for why it moved.

Each analysis also records whether the evidence is confirmed, mixed or insufficient for
the priced platforms. Mixed/insufficient evidence suppresses forecast figures from the
recommendation prompt, and a post-generation guard rejects creator-facing projected
orders, views, total commission, revenue or ROI if they still appear. Offer terms such as
a fixed fee or per-sale rate remain usable because they are commitments, not forecasts.

**Contract confirmed → the whole delivery plan.** Confirming a parsed contract generates
its content items (inheriting the deal's platform when unambiguous), payment items with
their triggers, a shipment if a product is involved, and seeds the onboarding checklist —
carrying over anything a returning creator already completed. Conditional deadlines retain
their fixed anchor, delivery-relative offset and `fixed` / `after delivery` / `later of` /
`earlier of` mode, so delivery resolves the operational date without erasing the contract rule.
On a mixed-platform deal every content item must name one of the deal's platforms before
the contract can be confirmed; manual items enforce the same rule and older blank items
can be repaired in Fulfillment. Unresolved items are excluded from platform benchmarks,
never silently credited to the primary platform.

**Agreement → provisional operations.** Marking a deal Agreed performs the safe part of
the hand-off immediately: reusable onboarding is seeded, an editable contract draft is
generated, and an unambiguous deliverable scope becomes provisional content items. A
mixed-platform scope that cannot be attributed is left for the manager instead of being
guessed. Contract confirmation remains the authoritative step for payment, product and
signed-source terms and replaces only untouched provisional rows. Production progress,
drafts, notes, checks, results and settled money are protected from destructive
re-confirmation.

**Onboarding → content.** Unfinished *blocking* steps (tracking link, coupon code) mark
content as blocked once filming has started, appear as the `Setup` column on Partners, and
raise a dashboard item that escalates when content is already in production. On a posted
item the block becomes a flag rather than an action — the link cannot be applied
retroactively, but it still explains why the numbers will never arrive.

**Shipment → content.** An undelivered product blocks *planned* content and makes it our
move, not the creator's — they cannot film what has not arrived. Marking a shipment
Shipped requires carrier plus tracking, or an explicit written reason that normal tracking
is unavailable; all details remain editable after dispatch. Marking a shipment delivered
resolves every `+N days after delivery` rule into a real publish date, except where the
manager has approved a creator-requested override. The resulting date activates draft
deadlines, overdue checks and the calendar.

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
submission — not from when you happen to open the deal. A proposed publication date is a
separate manager-owned exception: it reaches the same worklist but does not alter the
operational deadline until approved.

**Rights → price → contract → check.** Usage rights, whitelisting and exclusivity marked
on a deal flow into both prompts as named line items priced from the Playbook's structured
monthly percentages — anchor, target and walk-away all include the premiums and show the
uplift arithmetic, and drafts must state exact scope
and duration (named competitors, not "no competing brands"). The generated contract's
rights clause is written from the same structure the price was based on. And when a signed
contract is parsed, its usage/exclusivity terms are checked against what the deal was
priced for — a priced right missing from the contract, or a contract grant that was never
priced, shows as a warning in the Paperwork section before confirming. Deliberately a
presence check: the contract side is prose, and anything subtler would be guessing.

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

**Everything → Dashboard; decisions → Approvals.** Every domain contributes to the broad
attention panel, whose owner tags distinguish work from chases. The subset with evidence
ready for a manager decision also enters Approvals, grouped by Content, Contracts, Money,
or Setup & completion. Both views are derived from source records rather than separately
maintained tasks.

**Deal stage gates behaviour.** Creating or advancing fulfillment is server-gated to
`agreed` deals — client buttons cannot bypass it. Content moves forward one step at a
time: submission requires a draft URL, approval freezes that version, posting requires a
live HTTP(S) URL, and verification requires every checkable brief item (and minimum
duration) to pass. Completed deals are read-only until reopened to Agreed. Legacy
fulfillment on unsigned deals remains visible for recovery but is clearly locked, and it
does not pollute the Content board or measurement reminders.

**Writes fan out.** Any write must revalidate every screen that reads what it changed, not
just the one it was made from. Mutating content, payments, shipments or onboarding
refreshes the deal page, Dashboard, Pipeline, Content, Payments, Partners and Benchmarks
and Approvals together. Writes made from *outside* the app — a creator submitting a draft or a live URL
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
| `deals` | The negotiation: stage, asks, offers, ladder numbers, audience metrics, rights (usage/whitelisting/exclusivity JSON), analysis, decline/revisit, actuals |
| `partners` / `partner_channels` | Creators, legal details, portal token, per-platform average views |
| `messages` | The negotiation thread, including Copilot recommendations |
| `campaigns` | Named budgets, per-campaign playbook overrides, brief and its extracted requirements |
| `playbook` / `settings` | Per-platform rules; global rules, unit economics, brand profile, negotiation style, onboarding template, measurement windows |
| `contracts` / `contract_drafts` | Uploaded contracts and their parsed terms; generated drafts until signed |
| `content_items` | Deliverables: deal-platform attribution, status, resolved/fixed/relative date rule, approved date override, pending creator date request/reason, draft/approval/posted URLs, revision round, transcript, check result, actuals |
| `onboarding_tasks` | Setup checklist, partner- or deal-scoped |
| `shipments` | Product delivery, address token, carrier, tracking, and explicit no-tracking exception |
| `payment_items` | Amounts, triggers, linked content, status |
| `reminders` | Your own follow-ups |
| `usage_log` | Every model call: kind, model, tokens, cache reads and writes, cost in cents at the time it ran, and nullable `account_id` / `brand_id` — unused while the app is single-tenant, but present because this is the one table whose history cannot be attributed retrospectively once a second tenant's rows are interleaved |

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
prompt. Costs are logged per call — priced at write time into `usage_log.cost_cents`,
since what a call cost when it ran is a fact about that call — and totalled in Settings.

**The trust boundary.** The analysis prompt is assembled in three parts, stable to volatile:
the playbook, then this deal's facts from the manager's own records, then everything the
creator supplied — their message, rate card, report text, the extracted figures and the
document itself — fenced inside `<creator_supplied>` and preceded by a preamble stating
that it is evidence and never instruction. Text in that region that addresses the model,
claims authority or names a price to accept is recorded as a `crit` red flag rather than
acted on. Two cache breakpoints sit at the part boundaries: one after the playbook, which
is identical across every deal, and one at the tail, which the `pause_turn` resume loop
re-reads on each resume. Web search is capped at 3 uses, because each search's results are
re-billed on every resume that follows it.

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
