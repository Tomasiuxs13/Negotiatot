/** Playbook fields a campaign may override. Anything omitted falls back to the global Playbook. */
export interface CampaignOverrides {
  geoLabel?: string;
  minGeoShare?: number;
  maxPerDeal?: number;
  maxCpmIntegration?: number;
  maxCpmShort?: number;
  minEngagementRate?: number;
  minAvgViews?: number;
}

export type CampaignObjective = "awareness" | "engagement" | "conversion";
export type CampaignKpi = "views" | "engagements" | "clicks" | "orders" | "revenue";

export const CAMPAIGN_OBJECTIVES: {
  key: CampaignObjective;
  label: string;
  description: string;
  defaultKpi: CampaignKpi;
}[] = [
  {
    key: "awareness",
    label: "Awareness",
    description: "Maximize qualified reach and video consumption.",
    defaultKpi: "views",
  },
  {
    key: "engagement",
    label: "Engagement",
    description: "Generate interaction or traffic from the right audience.",
    defaultKpi: "engagements",
  },
  {
    key: "conversion",
    label: "Conversion",
    description: "Drive attributable orders or revenue.",
    defaultKpi: "orders",
  },
];

export const CAMPAIGN_KPIS: Record<
  CampaignKpi,
  { label: string; shortLabel: string; objectives: CampaignObjective[] }
> = {
  views: { label: "Video views", shortLabel: "Views", objectives: ["awareness"] },
  engagements: {
    label: "Engagements",
    shortLabel: "Engagements",
    objectives: ["engagement"],
  },
  clicks: { label: "Link clicks", shortLabel: "Clicks", objectives: ["engagement", "conversion"] },
  orders: { label: "Orders / conversions", shortLabel: "Orders", objectives: ["conversion"] },
  revenue: { label: "Attributed revenue", shortLabel: "Revenue", objectives: ["conversion"] },
};

export function objectiveLabel(value: CampaignObjective | null | undefined): string | null {
  return CAMPAIGN_OBJECTIVES.find((objective) => objective.key === value)?.label ?? null;
}

export function campaignGoalLabel(
  campaign: Pick<Campaign, "objective" | "primary_kpi" | "kpi_target">
): string | null {
  const objective = objectiveLabel(campaign.objective);
  const kpi = campaign.primary_kpi ? CAMPAIGN_KPIS[campaign.primary_kpi]?.shortLabel : null;
  if (!objective && !kpi) return null;
  const target = campaign.kpi_target != null ? ` · target ${campaign.kpi_target.toLocaleString("en-US")}` : "";
  return `${objective ?? "Campaign"}${kpi ? ` → ${kpi}` : ""}${target}`;
}

export interface Campaign {
  brief_path?: string | null;
  brief_requirements?: string | null;
  brief_filename?: string | null;
  brief_mime?: string | null;
  id: number;
  name: string;
  objective: CampaignObjective | null;
  primary_kpi: CampaignKpi | null;
  kpi_target: number | null;
  overrides: string; // JSON CampaignOverrides
  budget: number | null;
  archived: 0 | 1;
  created_at: string;
}

export const OVERRIDE_FIELDS: { key: keyof CampaignOverrides; label: string; numeric: boolean }[] = [
  { key: "geoLabel", label: "Target geo", numeric: false },
  { key: "minGeoShare", label: "Min geo share (%)", numeric: true },
  { key: "maxCpmIntegration", label: "Max CPM · integration ($)", numeric: true },
  { key: "maxCpmShort", label: "Max CPM · short ($)", numeric: true },
  { key: "minAvgViews", label: "Min avg views", numeric: true },
  { key: "minEngagementRate", label: "Min engagement (%)", numeric: true },
  { key: "maxPerDeal", label: "Max per deal ($)", numeric: true },
];

export function parseOverrides(raw: string | null | undefined): CampaignOverrides {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as CampaignOverrides;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Merges a campaign's overrides onto the global per-platform playbook rules.
 * Only keys the campaign actually sets are replaced — everything else falls through.
 */
export function applyCampaignOverrides(
  rulesByPlatform: Record<string, Record<string, unknown> | null>,
  overrides: CampaignOverrides
): Record<string, Record<string, unknown> | null> {
  const active = Object.entries(overrides).filter(
    ([, v]) => v !== undefined && v !== null && v !== ""
  );
  if (active.length === 0) return rulesByPlatform;

  return Object.fromEntries(
    Object.entries(rulesByPlatform).map(([platform, rules]) => [
      platform,
      rules ? { ...rules, ...Object.fromEntries(active) } : rules,
    ])
  );
}

/** Human-readable summary of what a campaign changes, for the deal page. */
export function describeOverrides(overrides: CampaignOverrides): string[] {
  return OVERRIDE_FIELDS.filter(
    (f) => overrides[f.key] !== undefined && overrides[f.key] !== null && overrides[f.key] !== ""
  ).map((f) => `${f.label}: ${overrides[f.key]}`);
}
