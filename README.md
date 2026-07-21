# Counterpart — Negotiation Copilot for Influencer Deals

Counterpart helps influencer-marketing managers negotiate creator deals with data instead of gut feel. You feed it whatever you have — a Modash/HypeAuditor PDF, a screenshot of a rate card, a pasted DM, a channel URL, or just your own numbers — and it:

1. **Analyzes the deal against your Playbook** — computes your four numbers (anchor, target, walk-away, breakeven) with the math shown, grades the channel's metrics against your thresholds, and flags red flags (fake followers, declining views, audience-geo mismatch).
2. **Coaches the negotiation** — drafts your opening offer or your next reply in three tones (balanced / warm / firm), with transparent reasoning: the CPM math, the negotiation principle, what scope to trade before conceding price, and the expected counter.
3. **Learns from your results** — log post-campaign actuals and the Benchmarks page calibrates your real CPM per platform from your own closed deals.

Built with Next.js (App Router), SQLite, and the Claude API (`claude-opus-4-8` with adaptive thinking, structured outputs, PDF/vision input, and web search for channel research).

## Features

- **Pipeline** — kanban board (Analyzing → Offer Sent → Negotiating → Agreed) with drag-and-drop, platform filter, KPI cards, and a monthly budget bar.
- **New Deal intake** — multi-platform deals with a free-text deliverables list ("1× YouTube integration + 2× IG reels"); every input optional, including outbound deals where you make the first offer. Uploads (PDF or screenshot) are parsed by Claude; oversized images are auto-resized server-side.
- **Deal workspace** — price-ladder visualization, analysis tab with verdict + reasoning, threaded negotiation with the Copilot card, offer tracker, concession ladder, and guardrails (never drafts above walk-away).
- **Playbook** — per-platform economics targets, unit economics (drives breakeven), negotiation style, concession ladder, and non-negotiables. Every number and draft traces back to this page.
- **Campaigns** — optional per-campaign overrides of any Playbook rule (target geo, CPM ceilings, engagement floor, max per deal) plus a campaign budget. Run a SE-Asia push at a different geo target without touching your global rules; blank fields inherit.
- **Actuals & Benchmarks** — log views/clicks/orders/revenue on closed deals; see predicted vs actual CPM, delivery %, and ROAS per platform.

## Setup

```bash
npm install
# create .env.local with your key:
# ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

Open http://localhost:3000. The SQLite database is created and seeded with demo deals on first run at `data/counterpart.db` (gitignored — back it up to keep your deal history).

For production: `npm run build && npm start`. Tests: `npm test` (vitest).

Requires Node 22+ (`better-sqlite3` is compiled against it — if you switch Node versions, run `npm rebuild better-sqlite3`).

## Notes

- All prices are EUR; valuation is always on **real average views**, never follower counts.
- Analysis and recommendation calls take 30–120 s (Opus with adaptive thinking) and cost a few cents each.
- Single-user by design: no auth, local database, your API key stays in `.env.local`.
