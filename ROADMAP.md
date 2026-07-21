# Roadmap — Counterpart → Full Influencer Management Platform

The end state: one system that covers the entire partner lifecycle —

> Sourcing → Lead → Communication → **Negotiation (built ✅)** → Registration → Contract → Content items → Payment items → Product delivery → Content delivery w/ reminders → Payment approval → Results → AI suggestions

The negotiation copilot stays the differentiator: competitors (Grin, Upfluence, CreatorIQ) manage this workflow, but none of them *negotiate for you* or price deals from your own playbook and closed-deal data. Everything below grows outward from that core.

## Guiding principles

1. **No double entry, ever.** The deal already knows the deliverables and price; the contract confirms them; content items and payment items are *generated* from the contract, not typed in again. Every downstream object derives from an upstream source of truth.
2. **Payment follows proof.** A payment item is approvable only when its linked content items are verified live. Encode the dependency in data, not in someone's memory.
3. **Grow from the working core.** Extend the existing deal pipeline upstream (leads) and downstream (fulfillment) rather than building a parallel CRM next to it.
4. **Buy data, build workflow.** HypeAuditor-grade audience data is a data-company product (crawlers, ML, panels). Integrate or license it. What nobody can buy is *our own* accumulating dataset: real negotiated prices, real delivery rates, real CPMs from closed deals — that becomes the proprietary moat.
5. **Ship each phase into daily use before starting the next.** Real usage will reorder this list; let it.

## The one decision to make early

**Internal tool or SaaS for clients?** The sourcing idea ("client can choose from our list") implies SaaS. That eventually means multi-tenancy, auth, hosted Postgres, file storage. The plan below defers that migration to Phase 3 — the first moment an external user (a partner uploading content) touches the system — so Phases 1–2 keep today's single-tenant velocity. But UI copy, data model, and pricing thinking should assume SaaS from now on.

---

## Phase 1 — CRM spine (internal)

**Goal: the whole lifecycle in one place.**

- **Partner entity** (the key refactor): today a creator is a string on a deal. Partner becomes a first-class record — contact info, channels/handles per platform, tags, notes — with deals, contracts, content, payments, and shipments attached. Deal history per partner across campaigns.
- **Extended pipeline**: `Lead → Contacted → Negotiating → Won → Onboarding → Active → Completed/Declined`. The current kanban and copilot slot into the middle unchanged.
- **Registration checklist**: per-platform config for how a partner gets onto the affiliate platform (self-registration link vs. manager-registered), tracked as onboarding tasks on the deal.
- **Contracts**: upload the signed PDF; Claude parses it into structured terms (deliverables, fees, payment schedule, usage rights, exclusivity) for one-click confirmation — reusing the existing document-parsing engine. Confirmed terms auto-draft the content items and payment items.
- **Deal types**: paid / gifted (product-only, "X videos for the product") / gifted + paid — this shapes which payment items exist.

## Phase 2 — Fulfillment engine (internal)

**Goal: nothing slips, nobody gets paid before delivering.**

- **Content items**: status machine `briefed → submitted → approved → posted → verified`, each with a due date and a link (file upload comes with the portal in Phase 3).
- **Shipments**: product, address, tracking number, status; linked to the content commitments it triggers ("product delivered → 30-day content clock starts").
- **Reminders**: scheduled job (cron) + email (e.g. Resend) — manager daily digest plus per-item nudges to partners as deadlines approach.
- **Payment approval queue**: payment items become approvable when their content items are verified; approve/reject with an audit trail; export for accounting.

## Phase 3 — Platform migration + partner portal (first external users)

**Goal: partners serve themselves.**

- Migrate: SQLite → managed Postgres, add auth (magic-link login for partners, team accounts for managers), object storage (S3/R2) for contracts and uploads, hosted deployment. This is also where multi-tenancy lands if SaaS.
- **Partner portal**: each partner gets a page scoped to their contract — their content items and due dates, submit-a-link (and optional file upload for pre-publish approval), shipment tracking, payment status. No more chasing over DMs.

## Phase 4 — Results & intelligence

**Goal: close the loop from promise to performance.**

- **Platform APIs** (YouTube Data, Instagram Graph, TikTok): auto-verify posted content and pull views/engagement — the existing Actuals/Benchmarks system fills itself.
- **Affiliate network connectors**: start with the 1–2 networks actually in use plus a universal fallback (postback URL + CSV import) — *not* "most networks" up front; add by demand.
- **AI suggestions** (extends the existing engine, now fed by real performance): per-partner recommendations (scale up, renegotiate at a lower CPM, bundle, drop) and campaign-level suggestions, each with the reasoning shown — same transparency pattern as the copilot.

## Phase 5 — Affiliate support chatbot

**Goal: a second product surface on the same platform.**

- Embeddable widget (script tag, page-targeted) answering affiliate/partner questions from a client-managed knowledge base (RAG).
- Every conversation logged; analytics on most-asked questions; unanswered questions escalate to a ticket inbox for live support; human answers feed back into the KB so the bot improves.

## Phase 6 — Sourcing & discovery

**Goal: fill the top of the funnel.**

- Integrate a data provider (Modash/HypeAuditor API, per-lookup pricing) rather than building crawlers; the existing web-research engine already handles lightweight vetting from a channel URL today.
- Discovery lists → "add to prospects" → lands in the Phase-1 pipeline as a Lead.
- Long term, the real differentiator isn't scraped follower data — it's benchmark intelligence from actual closed deals ("creators like this close at €X CPM"), which only accumulates inside this product.
