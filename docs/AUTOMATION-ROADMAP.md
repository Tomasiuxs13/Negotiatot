# Counterpart automation roadmap

## Product objective

Counterpart should remove coordination work from an influencer manager without making
commercial, legal, or payment decisions invisibly. The system may prepare, calculate,
detect, organise, and remind automatically. Anything that changes agreed scope, price,
contract terms, publication dates, or money leaving the business remains an explicit
manager approval.

The roadmap separates features that work with Counterpart's existing database and AI
provider from features that require access to an email, social, affiliate, signature, or
finance service.

## Feature map

| Capability | Useful outcome | Internal portion | External dependency | Phase |
| --- | --- | --- | --- | --- |
| Communication and follow-up automation | The manager always knows whose move it is and has a reply ready | Silence detection, follow-up drafts, reminders, approval queue, communication history | Inbox sync and sending through Gmail/Outlook | 1 internally, 4 connected |
| Campaign operations autopilot | An agreed deal immediately becomes an actionable delivery plan | Seed onboarding, prepare contract draft, derive unambiguous content items, detect missing setup, adjust delivery-relative dates | None | 1 |
| Returning-creator intelligence | A repeat deal opens with the creator's history and operational record already present | Immediate prefill, channel history, prior rates, actual CPM, delivery and revision reliability | None | 1–2 |
| Automatic content monitoring | Live obligations are not forgotten | Measurement windows, URL capture, removal/check checklist, evidence history | Platform APIs or compliant page monitoring for automatic collection | 2 internally, 4 connected |
| Brief and content compliance | Reviews become a structured exception process | Requirement checklist, transcript/visual findings, revision draft, manager approval | Existing configured AI provider for extraction; no new business integration | 2 |
| Creator collaboration portal | Creators update the work without status-chasing messages | Draft/live links, legal and shipping details, deadline-change requests, revision state, payment visibility | None; optional notification delivery later | 1–2 |
| Approval and exception inbox | Managers work one decision queue instead of searching every deal | Payment, draft, deadline, contract, tracking, setup, and completion exceptions | None | 1–2 |
| Email sync and scheduled delivery | Conversations and approved follow-ups move without copy/paste | Approval and scheduling policy can be built internally | Gmail/Outlook connection and send permission | 4 |
| Platform and affiliate metrics | Actuals arrive without manual entry | Attribution model, measurement state, reconciliation and exception UI | Social-platform and affiliate-network APIs | 4 |
| E-signature | Contract status updates from signatures | Contract generation, versioning and source confirmation already remain internal | Signature provider | 5 |
| Accounting and payouts | Approved money is reconciled and paid without re-entry | Approval rules, exports, immutable payment history | Accounting/banking/payout provider | 5 |

## Delivery phases

### Phase 0 — Trusted commercial calculations (complete)

- Platform-specific pricing and evidence provenance.
- Rights-inclusive guardrails.
- One explicit commission model and named ROAS cost bases.
- Platform-attributed actuals and benchmark protection.
- Contract deadline rules retained after product delivery.
- AI recommendation evidence guard.

### Phase 1 — Internal operations autopilot (implemented 18 August 2026)

This phase has no new third-party dependency.

- When a deal becomes Agreed, immediately seed reusable onboarding, generate an editable
  contract draft, and derive provisional content items only when the platform/scope is
  unambiguous.
- Put incomplete agreement setup into one exception item: unsigned contract, missing
  content plan, or missing payment schedule.
- Load a selected partner's profile and channel history on the first render of New Deal,
  not after a blur event.
- Show delivery reliability and revision history alongside commercial history.
- Let a creator propose a new publication date with a reason; require manager approval or
  rejection before the operational calendar changes.
- Require carrier and tracking before a shipment becomes Shipped, or record an explicit
  tracking exception.

Acceptance:

1. Marking a deal Agreed produces visible setup work without an AI call.
2. No ambiguous mixed-platform deliverable is silently generated.
3. Starting from a partner shows their known fields and history before interaction.
4. A creator's requested date never changes the real deadline until approved.
5. A shipment cannot become Shipped without tracking details or a recorded exception.

Verification status: complete. The flow was exercised end to end in an isolated copy of
the app: agreement created an editable contract draft, onboarding and three unambiguous
content items; incomplete source/payment setup reached the Dashboard; a portal date
request remained provisional until manager approval; the shipment guard blocked missing
tracking and accepted a documented exception. The manager and portal screens both fit a
390 px viewport without horizontal overflow.

### Phase 2 — Review and collaboration automation (in progress)

Implemented 18 August 2026:

- A unified Approvals view over submitted drafts, date requests, contract confirmation and
  discrepancies, ready payments, agreement-setup gaps, and collaborations ready to close.
  Decisions are grouped and filterable, urgent mismatches are promoted, and every item
  links to its exact source block. Creator chases remain on Dashboard instead of inflating
  the manager-decision queue.

Remaining:

- Direct draft-file upload with private, token-scoped access and version history.
- Per-requirement manager decisions: pass, fail, accepted exception, or not applicable.
- Static-image and sampled-video-frame checks, with human confirmation for subjective
  placement and brand-quality requirements.
- Creator portal comments attached to one deliverable and revision round.
- Internal live-content checklist for caption, disclosure, mention, link, pinned comment,
  retained-live duration, and final measurement.

Acceptance:

- Every approval names the source version and records who/when/what changed.
- Reloading never loses a long-running media check or a manager decision.
- Subjective or unsupported findings can never auto-reject creator work.

### Phase 3 — Relationship and portfolio intelligence

- Suggested repeat-deal fee range based on comparable prior scope, platform, actual CPM,
  delivery reliability, rights, and current playbook—not a single last-price copy.
- Creator scorecard with transparent components: delivery, responsiveness, revisions,
  performance, and commercial efficiency.
- Campaign capacity view showing content collisions, unconfirmed slots, expected spend,
  and managers' unresolved approvals.
- Re-engagement suggestions for strong past creators and timing-based declines.

Acceptance:

- Every recommendation shows the exact historical records behind it.
- Missing or incomparable history produces “not enough evidence,” not a synthetic score.
- A score never changes a price or rejects a creator automatically.

### Phase 4 — Connected communications and measurement

- Gmail/Outlook conversation sync, identity matching, reply detection, approved sending,
  and scheduled follow-ups that cancel when a response arrives.
- Social and affiliate metric collection with source timestamps, platform attribution,
  reconciliation against manually supplied figures, and API-failure fallbacks.
- Compliant live-post availability monitoring and contracted-duration alerts.

Guardrails:

- Start read-only; enable sending or writes only after identity matching is auditable.
- Never attach an email thread to a creator from name similarity alone.
- Keep source, retrieval time, measurement window, and manual overrides for every metric.
- Failed connections create exceptions; they do not silently turn results into zero.

Implemented 31 August 2026 for Gmail: read-only Inbox/Sent polling every five minutes through the
Chrome extension, durable provider-message deduplication, exact-email plus single-active-deal
matching, automatic Lead → Contacted on sent outreach, and reply logging without an automatic AI
call. Ambiguous mail remains in the Inbox review queue. Approved sending, Gmail push delivery,
Outlook and scheduled follow-ups remain future work.

### Phase 5 — Legal and financial integrations

- E-signature provider with immutable document versions and signer events.
- Accounting sync for approved bills and payment reconciliation.
- Payout provider only after approval roles, audit history, duplicate prevention, currency,
  tax data, and reversal handling are designed.

Guardrails:

- Counterpart remains the operational record; providers supply signed/payment events.
- No payment is created from an AI-extracted contract without manager confirmation.
- Idempotency keys and provider references are mandatory before any money-moving action.

## Recommended sequence

1. Continue Phase 2 with private draft versions and requirement-level decisions now that
   the unified approval and exception model is in place.
2. Add image and sampled-video checks only after those versioned decisions can preserve
   human overrides and accepted exceptions.
3. Add relationship intelligence after enough clean actuals and delivery history exist.
4. Connect email and metrics read-only, measure match quality, then add approved writes.
5. Add signature and finance integrations last, after permissions and auditability are
   mature.

## Explicit non-goals

- No fully autonomous negotiation or price changes.
- No automatic content rejection based only on AI output.
- No silent platform guessing for mixed-channel work.
- No automated email sending, signature, accounting entry, or payout without the relevant
  connected service and a deliberate permission model.
