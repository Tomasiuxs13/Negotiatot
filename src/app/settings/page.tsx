import PageHeader from "@/components/PageHeader";
import { getDeals, getUsageTotals } from "@/lib/db";
import { hasApiKey, MODEL } from "@/lib/claude";
import { usageCostUsd, totalTokens } from "@/lib/usage-cost";
import ApiAccessBlock from "@/components/settings/ApiAccessBlock";
import { getSetting } from "@/lib/db";
import GmailConnectionBlock from "@/components/settings/GmailConnectionBlock";
import { getGmailConnectionSummary, gmailSetupStatus } from "@/lib/gmail";
import { gmailOAuthStatus } from "@/lib/gmail-oauth-status";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";



export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail?: string | string[] }>;
}) {
  const query = await searchParams;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const gmail = gmailSetupStatus(`${protocol}://${host}`);
  const gmailConnection = getGmailConnectionSummary();
  const keyConfigured = hasApiKey();
  const dealCount = getDeals().length;
  const usage = getUsageTotals();
  const estCost = usageCostUsd(usage);

  const rows = [
    {
      label: "Claude API key",
      value: keyConfigured ? "Configured ✓" : "Missing",
      tone: keyConfigured ? "text-emerald-600" : "text-red-600",
      note: "Set via ANTHROPIC_API_KEY in .env.local — restart the app after changing it.",
    },
    {
      label: "Model",
      value: MODEL,
      tone: "text-slate-900",
      note: "Used for analysis, recommendations, and report/screenshot parsing, with adaptive thinking and web research.",
    },
    {
      label: "Database",
      value: `SQLite · ${dealCount} deal${dealCount === 1 ? "" : "s"}`,
      tone: "text-slate-900",
      note: "Stored locally in the app's data/ folder — back up the whole folder (not just the .db file) to keep your deal history.",
    },
    {
      label: "Currency",
      value: "USD",
      tone: "text-slate-900",
      note: "All prices and playbook thresholds are in dollars.",
    },
    {
      label: "API usage",
      value: `${usage.calls} call${usage.calls === 1 ? "" : "s"} · ≈ $${estCost.toFixed(2)}`,
      tone: "text-slate-900",
      note: `${totalTokens(usage).toLocaleString("en")} tokens across all analyses and recommendations, including ${usage.cacheReadTokens.toLocaleString("en")} served from cache at a tenth of input price. Priced at $5/$25 per million.`,
    },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle="Connections, usage, and secure access" />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl bg-white rounded-lg border border-slate-200 shadow-sm divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.label} className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">{r.label}</span>
                <span className={`text-sm font-medium font-tabular ${r.tone}`}>{r.value}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-[60ch]">{r.note}</p>
            </div>
          ))}
          <GmailConnectionBlock
            configured={gmail.configured}
            redirectUri={gmail.redirectUri}
            missing={gmail.missing}
            connection={gmailConnection}
            oauthStatus={gmailOAuthStatus(query.gmail)}
          />
          <ApiAccessBlock currentKey={getSetting<string>("api_key")} />
        </div>
      </main>
    </>
  );
}
