import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Deal, DealAnalysis, Message } from "./types";

export const MODEL = "claude-opus-4-8";

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function getClient(): Anthropic {
  if (!hasApiKey()) {
    throw new Error(
      "No Anthropic API key configured. Add ANTHROPIC_API_KEY to counterpart/.env.local and restart the dev server."
    );
  }
  return new Anthropic();
}

interface PlaybookContext {
  rulesByPlatform: Record<string, Record<string, unknown> | null>;
  campaignName?: string;
  unitEconomics: Record<string, unknown> | null;
  negotiationStyle: Record<string, unknown> | null;
}

function playbookBlock(ctx: PlaybookContext): string {
  const perPlatform = Object.entries(ctx.rulesByPlatform)
    .map(([p, rules]) => `Economics targets for ${p}: ${JSON.stringify(rules)}`)
    .join("\n");
  return [
    `## The manager's Playbook (hard rules — every number you produce must respect these)`,
    ctx.campaignName
      ? `These rules are already resolved for the campaign "${ctx.campaignName}" — campaign-specific overrides (e.g. a different target geo or CPM ceiling) are baked into the values below. Judge this deal only against these numbers.`
      : ``,
    perPlatform,
    `Unit economics (for breakeven math): ${JSON.stringify(ctx.unitEconomics)}`,
    `Negotiation style & concession rules: ${JSON.stringify(ctx.negotiationStyle)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function dealPlatformList(deal: Deal): string[] {
  if (deal.platforms) {
    try {
      const parsed = JSON.parse(deal.platforms) as string[];
      if (parsed.length > 0) return parsed;
    } catch {
      /* fall through */
    }
  }
  return [deal.platform];
}

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    verdict: { type: "string", enum: ["accept", "negotiate", "decline"] },
    verdictSummary: {
      type: "string",
      description:
        "2-3 sentences: how their ask compares to the manager's numbers, whether fundamentals pass the playbook, and the recommended path. Mention concrete euro amounts.",
    },
    metrics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          value: { type: "string" },
          note: { type: "string", description: "Short pass/fail note vs the playbook threshold" },
          tone: { type: "string", enum: ["good", "warn", "crit", "neutral"] },
        },
        required: ["label", "value", "note", "tone"],
      },
    },
    redFlags: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          severity: { type: "string", enum: ["good", "warn", "crit"] },
        },
        required: ["title", "detail", "severity"],
      },
    },
    numbers: {
      type: "array",
      description:
        "Exactly four entries labeled Anchor, Target, Walk-away, Breakeven — each with the computed euro value and the math behind it.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string", enum: ["Anchor", "Target", "Walk-away", "Breakeven"] },
          value: { type: "number" },
          explanation: { type: "string" },
        },
        required: ["label", "value", "explanation"],
      },
    },
    estimatedAvgViews: {
      type: ["number", "null"],
      description: "Average views per post/video if derivable from the inputs, else null",
    },
    estimatedEngagementRate: {
      type: ["number", "null"],
      description: "Engagement rate percent if derivable, else null",
    },
    theirAsk: {
      type: ["number", "null"],
      description: "The creator's asking price in EUR if stated in the message or rate card, else null",
    },
    extractedChannelUrl: {
      type: ["string", "null"],
      description:
        "The creator's channel/profile URL if found in the report, screenshot, or message (e.g. from a Modash report header), else null",
    },
  },
  required: [
    "verdict",
    "verdictSummary",
    "metrics",
    "redFlags",
    "numbers",
    "estimatedAvgViews",
    "estimatedEngagementRate",
    "theirAsk",
    "extractedChannelUrl",
  ],
} as const;

export interface AnalysisResult {
  analysis: DealAnalysis;
  numbers: { anchor?: number; target?: number; walkaway?: number; breakeven?: number };
  estimatedAvgViews: number | null;
  estimatedEngagementRate: number | null;
  theirAsk: number | null;
  extractedChannelUrl: string | null;
  usage: TokenUsage;
}

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const CONTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    deliverables: {
      type: "array",
      description:
        "Every piece of content the creator owes. One entry per distinct deliverable type; use quantity for repeats.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string", description: "e.g. 'YouTube integration, 60-90s'" },
          platform: {
            type: ["string", "null"],
            description: "One of: youtube, instagram, tiktok. Null if the deliverable is not platform-specific.",
          },
          quantity: { type: "number" },
          dueDate: { type: ["string", "null"], description: "YYYY-MM-DD if an absolute date is stated" },
          dueDaysAfterDelivery: {
            type: ["number", "null"],
            description: "Days after product delivery, if the deadline is relative to receiving a product",
          },
          dueRule: {
            type: ["string", "null"],
            description: "The deadline as written in the contract, if it is neither an absolute date nor days-after-delivery",
          },
        },
        required: ["description", "platform", "quantity", "dueDate", "dueDaysAfterDelivery", "dueRule"],
      },
    },
    payments: {
      type: "array",
      description: "Every payment owed to the creator. Split by milestone if the contract does.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string" },
          amount: { type: "number", description: "EUR" },
          trigger: {
            type: "string",
            enum: ["on_signing", "on_delivery", "on_verification", "date"],
          },
          dueDate: { type: ["string", "null"] },
        },
        required: ["description", "amount", "trigger", "dueDate"],
      },
    },
    product: {
      type: ["object", "null"],
      additionalProperties: false,
      description: "Physical product the brand sends, if any (gifted or seeded deals)",
      properties: {
        description: { type: "string" },
        value: { type: ["number", "null"] },
      },
      required: ["description", "value"],
    },
    usageRights: { type: ["string", "null"] },
    exclusivity: { type: ["string", "null"] },
    paymentTerms: { type: ["string", "null"], description: "e.g. Net-30" },
    totalFee: { type: ["number", "null"] },
    notes: {
      type: "array",
      items: { type: "string" },
      description: "Anything unusual worth the manager's attention (penalties, approval rights, renewal clauses)",
    },
  },
  required: [
    "deliverables",
    "payments",
    "product",
    "usageRights",
    "exclusivity",
    "paymentTerms",
    "totalFee",
    "notes",
  ],
} as const;

export interface ContractParseResult {
  terms: unknown;
  usage: TokenUsage;
}

/** Reads a signed contract into structured terms the app can generate work from. */
export async function parseContract(params: {
  pdfBase64?: string;
  image?: { base64: string; mediaType: ImageMediaType };
  text?: string;
  dealContext?: string;
}): Promise<ContractParseResult> {
  const client = getClient();
  const content: Anthropic.ContentBlockParam[] = [];

  if (params.pdfBase64) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: params.pdfBase64 },
    });
  }
  if (params.image) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: params.image.mediaType, data: params.image.base64 },
    });
  }
  content.push({
    type: "text",
    text: [
      "Extract the operative terms from this influencer marketing contract so they can be tracked.",
      "Rules:",
      "- Capture every deliverable and every payment, exactly as agreed. Do not invent terms.",
      "- Amounts in EUR as numbers. If a currency other than EUR is used, still return the number and note the currency in notes.",
      "- If a deadline is relative to receiving a product, use dueDaysAfterDelivery rather than guessing a date.",
      "- If something important is ambiguous or missing (no deadline, no payment trigger), say so in notes.",
      params.text ? `\nContract text:\n"""${params.text}"""` : "",
      params.dealContext ? `\nFor context, the deal as negotiated:\n${params.dealContext}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "You are Counterpart, reading signed influencer contracts for a marketing manager. You extract terms faithfully and never invent obligations that are not in the document.",
    messages: [{ role: "user", content }],
    output_config: {
      format: { type: "json_schema", schema: CONTRACT_SCHEMA as unknown as Record<string, unknown> },
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The contract could not be read (refused).");
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty contract parse response.");

  return {
    terms: JSON.parse(text),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

export async function analyzeDeal(params: {
  deal: Deal;
  playbook: PlaybookContext;
  reportPdfBase64?: string;
  reportImage?: { base64: string; mediaType: ImageMediaType };
  reportText?: string;
  theirMessage?: string;
  channelUrl?: string;
}): Promise<AnalysisResult> {
  const { deal, playbook } = params;
  const client = getClient();
  const platforms = dealPlatformList(deal);
  const scope = deal.deliverables ?? deal.format;

  const facts: string[] = [
    `Creator: ${deal.creator}`,
    `Platform(s): ${platforms.join(", ")}`,
    `Deliverables we want: ${scope ?? "unspecified — assume one standard placement per platform"}`,
  ];
  if (deal.first_ask != null) facts.push(`Their first ask: €${deal.first_ask}`);
  if (deal.avg_views != null) facts.push(`Known avg views: ${deal.avg_views}`);
  if (deal.engagement_rate != null) facts.push(`Known engagement rate: ${deal.engagement_rate}%`);
  if (params.channelUrl) facts.push(`Channel URL: ${params.channelUrl}`);
  if (params.theirMessage) facts.push(`Their message / rate card:\n"""${params.theirMessage}"""`);
  if (params.reportText) facts.push(`Analytics report (text):\n"""${params.reportText}"""`);

  const userContent: Anthropic.ContentBlockParam[] = [];
  if (params.reportPdfBase64) {
    userContent.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: params.reportPdfBase64 },
    });
  }
  if (params.reportImage) {
    userContent.push({
      type: "image",
      source: {
        type: "base64",
        media_type: params.reportImage.mediaType,
        data: params.reportImage.base64,
      },
    });
    facts.push(
      `An image is attached — a screenshot of the creator's analytics report or rate card. Extract every stat and price from it.`
    );
  }
  userContent.push({
    type: "text",
    text: [
      `Analyze this influencer deal for the manager. This deal covers the deliverables listed above${platforms.length > 1 ? ` across ${platforms.length} platforms` : ""}. Compute the four numbers strictly from the Playbook:`,
      `- Value each deliverable separately using that platform's realistic avg views × that platform's max CPM for the format, then sum into bundle-level numbers.`,
      `- Target = the summed fair value, discounted for quality issues (view trend, geo shortfall, engagement).`,
      `- Walk-away = the summed hard ceiling implied by the playbook max CPMs on realistic views.`,
      `- Breakeven = total predicted clicks across deliverables × conversion × AOV × margin × repeat factor from unit economics.`,
      `- Anchor = the opening offer per the playbook's anchoring rule (below target, defensible with data).`,
      `In the number explanations, show the per-deliverable breakdown when there is more than one deliverable.`,
      `Grade each metric against the playbook thresholds. Flag data-quality and audience risks. Be honest about uncertainty when inputs are thin.`,
      params.channelUrl
        ? `A channel URL was provided — use web search to research this creator's current stats (avg views per format, followers, engagement, audience geo, recent sponsors) before computing the numbers. Prefer searched data over assumptions and cite what you found in the metrics/flags.`
        : params.reportPdfBase64 || params.reportImage
          ? `If the report contains the creator's channel/profile URL, report it in extractedChannelUrl. If key stats are missing or look stale, you may use web search to verify or fill them in — cite what you found.`
          : ``,
      ``,
      `## Deal facts`,
      ...facts,
      ``,
      playbookBlock(playbook),
    ]
      .filter(Boolean)
      .join("\n"),
  });

  const tools =
    params.channelUrl || params.reportPdfBase64 || params.reportImage
      ? [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 6 }]
      : undefined;

  const baseRequest = {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" as const },
    system:
      "You are Counterpart, a negotiation copilot for influencer marketing managers. You do rigorous, playbook-driven deal analysis. All prices in EUR, integers. You value channels on real average views, never follower counts. You never invent statistics — when an input is missing and can't be researched, say so in the relevant metric/flag and widen your uncertainty.",
    ...(tools ? { tools } : {}),
    output_config: {
      format: { type: "json_schema" as const, schema: ANALYSIS_SCHEMA as unknown as Record<string, unknown> },
    },
  };

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const track = (r: Anthropic.Message) => {
    usage.inputTokens += r.usage.input_tokens;
    usage.outputTokens += r.usage.output_tokens;
  };

  let response = await client.messages.create({
    ...baseRequest,
    messages: [{ role: "user", content: userContent }],
  });
  track(response);

  // Server-side tools (web search) can pause the turn; resume until done.
  let pauseGuard = 0;
  while (response.stop_reason === "pause_turn" && pauseGuard < 5) {
    pauseGuard += 1;
    response = await client.messages.create({
      ...baseRequest,
      messages: [
        { role: "user", content: userContent },
        { role: "assistant", content: response.content },
      ],
    });
    track(response);
  }

  if (response.stop_reason === "refusal") {
    throw new Error("Analysis was refused by the model. Try rephrasing the inputs.");
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty analysis response from Claude.");
  const parsed = JSON.parse(text) as {
    verdict: DealAnalysis["verdict"];
    verdictSummary: string;
    metrics: DealAnalysis["metrics"];
    redFlags: DealAnalysis["redFlags"];
    numbers: DealAnalysis["numbers"];
    estimatedAvgViews: number | null;
    estimatedEngagementRate: number | null;
    theirAsk: number | null;
    extractedChannelUrl: string | null;
  };

  const byLabel = Object.fromEntries(parsed.numbers.map((n) => [n.label, Math.round(n.value)]));
  return {
    analysis: {
      verdict: parsed.verdict,
      verdictSummary: parsed.verdictSummary,
      metrics: parsed.metrics,
      redFlags: parsed.redFlags,
      numbers: parsed.numbers,
    },
    numbers: {
      anchor: byLabel["Anchor"],
      target: byLabel["Target"],
      walkaway: byLabel["Walk-away"],
      breakeven: byLabel["Breakeven"],
    },
    estimatedAvgViews: parsed.estimatedAvgViews,
    estimatedEngagementRate: parsed.estimatedEngagementRate,
    theirAsk: parsed.theirAsk,
    extractedChannelUrl: parsed.extractedChannelUrl,
    usage,
  };
}

const RECO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    headline: {
      type: "string",
      description: "Short imperative move, e.g. 'Counter €2,300 and trade usage rights'",
    },
    proposedOffer: {
      type: "number",
      description: "The euro amount of the next offer/counter. Never above walk-away.",
    },
    pills: {
      type: "array",
      description: "2-3 short chips summarizing the move, first one is the price move",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          label: { type: "string" },
          tone: { type: "string", enum: ["good", "plain"] },
        },
        required: ["label", "tone"],
      },
    },
    reasoning: {
      type: "array",
      description:
        "3-5 bullets: the CPM math, the reciprocity/negotiation principle, what scope is being traded, and the expected counter with a plan for it.",
      items: { type: "string" },
    },
    drafts: {
      type: "object",
      additionalProperties: false,
      properties: {
        balanced: { type: "string" },
        warm: { type: "string" },
        firm: { type: "string" },
      },
      required: ["balanced", "warm", "firm"],
    },
    theirCurrentPosition: {
      type: ["number", "null"],
      description:
        "The creator's latest asking price in EUR as stated in the conversation (their current position after all counters), else null if they haven't named a price",
    },
  },
  required: ["headline", "proposedOffer", "pills", "reasoning", "drafts", "theirCurrentPosition"],
} as const;

export interface RecoResult {
  headline: string;
  proposedOffer: number;
  pills: { label: string; tone: "good" | "plain" }[];
  reasoning: string[];
  drafts: { balanced: string; warm: string; firm: string };
  theirCurrentPosition: number | null;
  usage: TokenUsage;
}

export async function recommendNextMove(params: {
  deal: Deal;
  messages: Message[];
  playbook: PlaybookContext;
}): Promise<RecoResult> {
  const { deal, messages, playbook } = params;
  const client = getClient();

  const thread = messages
    .filter((m) => m.sender !== "copilot")
    .map((m) => `${m.sender === "them" ? deal.creator : "Manager"}: ${m.body}`)
    .join("\n\n");

  const analysis = deal.analysis ? (JSON.parse(deal.analysis) as DealAnalysis) : null;

  const isOpening = thread.length === 0;
  const userText = [
    isOpening
      ? `The manager is initiating this deal — recommend and draft the OPENING OFFER message to the creator. It should introduce the collaboration (deliverables below), justify the price with data, and open at the anchor.`
      : `Recommend the manager's next move in this negotiation and draft the reply.`,
    ``,
    `## Deal state`,
    `Creator: ${deal.creator} (${dealPlatformList(deal).join(" + ")})`,
    `Deliverables we want: ${deal.deliverables ?? deal.format ?? "unspecified"}`,
    `Round: ${deal.round}`,
    `Their first ask: €${deal.first_ask ?? "unknown"} · their current position: €${deal.current_ask ?? "unknown"}`,
    `Our last offer: €${deal.current_offer ?? "none yet"}`,
    `Manager's numbers — anchor €${deal.anchor ?? "?"}, target €${deal.target ?? "?"}, walk-away €${deal.walkaway ?? "?"}, breakeven €${deal.breakeven ?? "?"}`,
    `Avg views: ${deal.avg_views ?? "unknown"} · engagement: ${deal.engagement_rate ?? "unknown"}%`,
    analysis ? `Prior analysis summary: ${analysis.verdictSummary}` : "",
    ``,
    `## Conversation so far`,
    thread || "(no messages yet — this is the opening offer)",
    ``,
    playbookBlock(playbook),
    ``,
    `## Rules for your recommendation`,
    `- Never propose above walk-away. If their position is above walk-away and no scope trade closes the gap, recommend holding or walking away.`,
    `- Trade scope before price: work down the concession ladder (extra deliverables, usage rights, bundles, bonuses) before raising the offer, and price steps must respect the max step %.`,
    `- Mirror their concession size; keep headroom.`,
    `- Drafts must be ready to send: specific numbers, no placeholders, in the same language the creator writes in, matching the manager's configured style.`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system:
      "You are Counterpart, a negotiation copilot for influencer marketing managers. You are on the manager's side of the table. You give grounded, playbook-compliant negotiation moves with transparent reasoning, and you write natural, human-sounding messages the manager can send verbatim.",
    messages: [{ role: "user", content: userText }],
    output_config: {
      format: { type: "json_schema", schema: RECO_SCHEMA as unknown as Record<string, unknown> },
    },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Recommendation was refused by the model.");
  }
  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) throw new Error("Empty recommendation response from Claude.");
  const parsed = JSON.parse(text) as Omit<RecoResult, "usage">;
  return {
    ...parsed,
    proposedOffer: Math.round(parsed.proposedOffer),
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}
