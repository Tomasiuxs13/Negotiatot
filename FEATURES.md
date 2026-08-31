# Counterpart — Features & Screens

An influencer-negotiation and delivery copilot. It takes a creator from first contact
through analysis, negotiation, contract, production, publication, verification and
payment — and calibrates its own advice against what actually closed.

> **This file is the map of the product.** Anything added, removed or materially changed
> in the app must be reflected here in the same change. See [Maintaining this file](#maintaining-this-file).

---

## Navigation

The sidebar groups screens by the job they support, so a new manager does not need to
learn nine peer-level destinations before finding the right one.

| Group | Screen | Route | One line |
|---|---|---|---|
| Overview | [Dashboard](#dashboard) | `/` | What needs you today |
| Deals | [Pipeline](#pipeline) | `/pipeline` | Every deal and where it stands |
| Deals | [Inbox](#inbox) | `/inbox` | Review incoming creator replies before recording them |
| Deals | [Creator intake](#creator-intake) | `/imports` | Reconcile provider lists before they enter the pipeline |
| Deals | [Approvals](#approvals) | `/approvals` | Decisions ready for you |
| Delivery | [Content](#content) | `/content` | Every deliverable and what it is waiting on |
| Delivery | [Payments](#payments) | `/payments` | Everything owed across deals |
| Relationships | [Partners](#partners) | `/partners` | Every creator, what they're worth, whether they're set up |

**Configure** — visited occasionally; these change how the work screens behave:

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
- Outreach that never got a reply (5+ days since the last thing we sent), rolled into
  one line when a batch went out together — the fix for all of them is the same trip to
  the contacted column. The advice changes as the chases stack up: send the first
  follow-up, send the last one, then drop it or keep waiting
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

- **Board** — a plain-language journey strip explains what each stage means and filters
  directly to it. Every card has a keyboard-accessible **Move to** menu; drag-and-drop
  remains a shortcut across lead → contacted → analyzing → offer sent → negotiating →
  agreed → completed. Completion is refused while tracked
  content, payments or shipments remain open; a won deal with operational records cannot
  be silently dragged back into negotiation. Add shortcuts appear only for stages the
  intake flow can actually create; critical stage changes also have in-deal buttons, so
  dragging is a convenience rather than the only path. Declined deals are not a column,
  but stay reachable via a link beneath the board.
- **List** — sortable table with their ask, our number, status and last activity.
- A contacted card and row say **which touch the creator is on** — `Reached out · 7d
  ago`, then `Follow-up 1 · 3d ago`, `Follow-up 2 · today` — instead of a status typed
  at outreach that read the same on day one and day thirty. Counted from the outbound
  messages in the thread, dated from `contacted_at` until the first chase is logged.
- Filters: platform, stage, campaign, free-text search.

Signed deals show a **phase** rather than a stage — "Producing 2/3", "Payment to approve",
"Ready to wrap" — because a deal is routinely mid-onboarding *and* mid-production *and*
awaiting payment at once. A `behind` note names anything earlier that was skipped over.

### Inbox
`/inbox` — *Review creator replies before they change a negotiation*

A manager connects Gmail with per-user OAuth and **read-only** access. The Chrome extension asks
Counterpart to poll Inbox and Sent every five minutes while Chrome and the local app are running.
The first automatic check establishes a current-time watermark, so installing the feature never
replays historical Sent mail into the pipeline.

- **Sent outreach:** when a recipient exactly matches a partner with exactly one active
  negotiation, Counterpart records the outbound message. Only a Lead advances automatically,
  and only to Contacted; later stages are never rewound or skipped.
- **Incoming reply:** the same exact-email, single-active-negotiation rule records the reply,
  marks it as the manager's move and advances an offered/analyzing deal to Negotiating. It does
  not start a paid Copilot run or send anything.
- **Partner only / no match:** the message stays in the queue, linked to the partner when
  possible, until the manager resolves the relationship. The app never guesses among several
  live deals, attaches mail to an agreed collaboration, or matches based on a similar name.
- **Check now:** the manual button runs the automatic Inbox/Sent pass immediately, then fills the
  review queue with up to 50 inbox messages from the last 30 days that have not been seen before.
- **Privacy and control:** OAuth credentials are encrypted at rest. Disconnecting removes
  Counterpart's local credentials and revokes the Google token when available; previously
  imported review and conversation records remain as part of the deal history. A durable Gmail
  message ID prevents every poll from duplicating the same event.

The Google Cloud setup is documented in [Gmail setup](docs/GMAIL-SETUP.md).

**Counterpart for Gmail** is the companion Manifest V3 Chrome extension in `extension/`.
It offers a lower-friction browser path when Gmail API access is unavailable: the user grants
the extension access only to `mail.google.com`, then connects it to Counterpart with the API key
from Settings. A purple Counterpart button appears beside Gmail and shows the exact-email matched
partner, single live deal, commercial guardrails and latest Copilot recommendation. The manager
can explicitly record the latest expanded creator message, ask Counterpart to draft the next
move, and copy or insert a balanced, warm or firm draft into an already-open Gmail composer.
The extension never chooses among ambiguous matches and never clicks Send.

The Gmail sidebar remains a foreground integration that sees only the open conversation. Its
service worker also schedules the read-only OAuth sync through Counterpart, so mail handled on
another device is picked up after Chrome and Counterpart are running again. The extension API is
exposed through authenticated, CORS-enabled `/api/extension/status`,
`/api/extension/gmail-sync`, `/api/extension/context` and `/api/extension/replies` routes; no
configured Counterpart API key means those routes are off.

### Creator intake
`/imports` — *Reconcile a discovery list before it becomes relationship work*

Imports Modash and HypeAuditor exports, a generic CSV/TSV/XLSX file, or a lightweight
manual creator record. The manager confirms the column mapping, then sees each creator
beside its matching Counterpart partner and any live deal before committing selected rows.

- **Identity comes first.** Provider record ID, normalised profile URL and email are safe
  match keys; a name-only similarity is displayed as a possible match but is never merged
  automatically.
- **External data remains evidence.** Each import retains its source, raw row and provider
  identity. It can fill a blank partner/channel field or add a secondary contact, but does
  not overwrite a manager-entered email, URL, audience metric or deal status.
- **Pipeline creation is intentional.** New records can enter as Partners only, a Pipeline
  prospect, or Contacted. A partial record with no supported social platform stays a
  partner until the manager has enough information to open a deal.

This is deliberately provider-neutral: Modash, HypeAuditor and future discovery tools are
sources of evidence, while Counterpart remains the source of truth for outreach and deal stage.

Mailbox syncing is a separate, credentialed integration: until a workspace connects Gmail or
another provider through OAuth, the Negotiation tab remains the place to capture a reply and
generate the approved response. A future inbox connection should match sender addresses to
partner contacts and provider identities first, create a reviewable draft, and only send after
manager approval — never infer a deal from a creator name or send automatically.

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
- **Campaigns** — an explicit objective (awareness, engagement or conversion), one primary
  KPI, an optional target and budget. The outcome stays visible on the campaign and deal;
  per-campaign pricing overrides are available under an advanced section rather than
  competing with the strategy fields
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

Claude API key status, active model, database location and deal count, currency, and
cumulative API usage with an estimated cost (including tokens served from cache at a
tenth of input price). **API access**: generate, copy, rotate or revoke the key that
switches the bulk-import endpoint on, with the endpoint URL and a copyable working
example assembled for the host you are browsing on.

**Gmail inbox** shows whether the OAuth client is configured, gives the exact redirect URI
needed in Google Cloud, and connects or disconnects one user-owned Gmail account. The required
server-only environment variables are `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and
`GMAIL_TOKEN_ENCRYPTION_KEY`; `GMAIL_REDIRECT_URI` is optional for a deployed host. Setup and
the Workspace-admin boundary are documented in [Gmail setup](docs/GMAIL-SETUP.md). The connection
button doubles as a permission check: after Google returns, Settings distinguishes a successful
self-approved connection from a Workspace policy block, a declined request, an expired state or
an OAuth configuration failure. A connection is saved only when Google confirms that the
read-only Gmail scope was actually granted. Once extension version 0.2 or later runs its first
check, Settings shows **Automatic tracking on** and explains the five-minute, Chrome-and-app
availability boundary. A deployed always-on instance can set `GMAIL_SYNC_SECRET` and use the
included systemd timer, which polls the authenticated loopback endpoint every five minutes
without depending on Chrome.

---

### New deal
`/new`

**Bulk import API** — `POST /api/deals/bulk` takes a JSON array of items shaped like the
form's fields (`creatorName`, `platform`, `email`, `stage` "lead"/"contacted", commission
and discount overriding Playbook defaults). Rows are independent — the response returns
`created` ids, per-row `errors`, and `duplicates`: creators (matched by name or email)
who already have a live deal are skipped, not doubled. Every row runs through the same
create path as the form. Analysis never runs from the import — stage "analyzing" is
refused, so a file can never silently start model runs. Requires an API key sent as `Authorization: Bearer …` or `x-api-key` — generated,
copied, rotated and revoked in **Settings → API access**, which also shows the endpoint
URL and a working example. No key configured means the API is off, not open.

**Deal lookup and bulk edits** — three more endpoints, all requiring the same API key:

- `GET /api/deals?handles=a,b,c` — resolves creator handles to `{handle, id, stage, live}`.
  Case-insensitive, tolerates a leading `@`. A creator with two live deals returns
  `id: null` plus every candidate, so a caller never guesses. Without handles it lists the
  pipeline, optionally filtered by `?stage=`.
- `POST /api/deals/decline` — `[{id|handle, reason, note?, revisitOn?}]`. The reason is
  validated against the enum in both forms (`no_reply` or "Went quiet"); free text is
  refused, because the UI renders the reason from a fixed map and an unknown value would
  show a deal declined for no stated cause.
- `POST /api/deals/stage` — `[{id|handle, stage}]`.

Both mutating endpoints accept `{dryRun: true, items: [...]}` and then report each change
as `{from, to}` without writing — which is what catches a move whose premise is already
wrong, such as promoting a creator who has in fact declined. Every write goes through the
same server action the UI calls, so the stage guards, won-stage protections and
revisit-date rules cannot drift between the two paths.


The form starts by asking what job the manager is doing: *Evaluate & price*, *Outreach
sent*, or *Save as prospect*. The pipeline's per-column add buttons preselect the matching
mode. The always-visible essentials are creator, platform, campaign outcome and deliverable
scope. Creator evidence (analytics report, message/rate card, channel URL and known stats)
is grouped together and opens automatically only for evaluation; contact/commission
exceptions and rights remain separate advanced sections. Starting from a partner profile loads the
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

A sticky app bar carrying the breadcrumb, tab strip and primary deal actions; secondary
decline/delete actions live under **More**. A stage guide immediately below the bar shows
the full lifecycle, explains the current stage and its next step, and lets the manager
move between active negotiation stages without returning to Pipeline. Agreement and
completion retain their guarded actions. Below it sits the **cockpit** (anchor, target,
walk-away, breakeven; total deal cost; affordability). The **Audience & evidence** band
(average views, engagement, audience geo, followers, fake-follower share, view trend) is
collapsed by default with an issue count, then expands to show every value and reason;
this keeps the recommendation and next action above the fold.

| Tab | What it holds |
|---|---|
| **Analysis** | Verdict (accept / negotiate / decline), reasoning, red flags, the four numbers with the arithmetic that produced them (written by `pricing.ts`, not narrated by the model), audience-data editor |
| **Negotiation** | Round-by-round thread, the Copilot's recommendation with a single ready-to-send draft, on-demand tone rewrite, reply capture. Any message can be removed (mis-pastes happen) — deletion also removes recommendations generated from it and rewinds round, move, asks, stage and label to what the remaining thread supports |
| **Fulfillment** *(signed deals)* | Contact strip (creator email + copyable portal URL), contract upload and parsing, generated contract draft, onboarding checklist with a generated welcome email, content items with the draft review loop and per-item nudge emails, integration check, product delivery, payments |
| **Actuals** *(delivered deals, plus legacy posted records)* | The campaign's primary KPI and progress to target, plus views for price calibration. Engagements, clicks, orders and revenue are supported per item but non-primary diagnostics sit under **Additional metrics**; measurement-window state, fee-only ROAS and all-in ROAS remain available |
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

**Campaign objective → actuals; content → benchmarks → playbook.** A campaign's one primary
KPI determines which result is requested and highlighted in Actuals; the optional target
shows progress without hiding supporting metrics. Per-item results roll up to the deal,
which feeds partner stats and the benchmark page, which is what tells you whether your
playbook's target CPM is realistic. Measurement windows decide when a view count is worth
reading and whether it counts toward the pricing averages.

**Inbox → negotiation.** Gmail is a read-only evidence source: an inbox item matches only on a
saved contact email, and can enter a negotiation only when that partner has exactly one live
deal and the manager chooses **Add reply & draft next move**. The captured reply follows the
same stage, recommendation and attention-panel updates as a pasted response; no email is sent.

**Outbound message → follow-up queue.** While a deal is in *Contacted*, *Offer sent* or
*Negotiating* and the
creator has the move, Counterpart waits three full calendar days from the last outbound message
before placing a stage-specific, editable follow-up in the Dashboard. A manager can copy it for
their email app, mark it sent (which starts a new waiting window), or snooze that exact message
for two days. Deal edits never reset the window; nor does a stale follow-up survive an incoming
reply or a newer outbound message. Until Gmail drafting is connected, this is intentionally
copy-and-record only: no email is created or sent.

*Contacted* deals run on the same machinery with two differences: outreach waits **five** days
rather than three, because nobody owes you a reply to a first email in three; and the wait is
dated from `contacted_at` until a chase is recorded, since the outreach email left from the
manager's own client and no outbound message exists to key on. Recording a chase numbers it —
the card then reads `Follow-up 1 · today` — and the second draft says it is the last note,
because a second chase that reads like the first one is how a sender gets filtered.

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
| `partner_contacts` / `partner_source_records` | Secondary emails and provider-specific identity/evidence; imported data is auditable and never silently replaces manager-owned fields |
| `creator_import_batches` / `creator_import_records` | Source file/manual intake audit trail and its per-row reconciliation outcome |
| `email_connections` / `inbound_emails` | Encrypted Gmail OAuth credentials and a manager-reviewed local inbox queue, with sender/deal match outcome and import status |
| `messages` | The negotiation thread, including Copilot recommendations |
| `deal_followup_states` | A manager's temporary snooze, anchored to the outbound message it postpones; follow-up eligibility itself is derived from the deal and messages |
| `campaigns` | Objective, primary KPI, target, named budget, per-campaign playbook overrides, brief and its extracted requirements |
| `playbook` / `settings` | Per-platform rules; global rules, unit economics, brand profile, negotiation style, onboarding template, measurement windows |
| `contracts` / `contract_drafts` | Uploaded contracts and their parsed terms; generated drafts until signed |
| `content_items` | Deliverables: deal-platform attribution, status, resolved/fixed/relative date rule, approved date override, pending creator date request/reason, draft/approval/posted URLs, revision round, transcript, check result, actual views/engagements/clicks/orders/revenue |
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
