import PageHeader from "@/components/PageHeader";
import { getDeals, getUsageTotals } from "@/lib/db";
import { hasApiKey, MODEL } from "@/lib/claude";

export const dynamic = "force-dynamic";

// Opus-tier pricing (USD per million tokens) — identical for claude-opus-5 and claude-opus-4-8
const INPUT_PER_M = 5;
const OUTPUT_PER_M = 25;

export default function SettingsPage() {
  const keyConfigured = hasApiKey();
  const dealCount = getDeals().length;
  const usage = getUsageTotals();
  const estCost =
    (usage.inputTokens / 1_000_000) * INPUT_PER_M + (usage.outputTokens / 1_000_000) * OUTPUT_PER_M;

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
      note: `${usage.inputTokens.toLocaleString("en")} input + ${usage.outputTokens.toLocaleString("en")} output tokens across all analyses and recommendations. Estimate at $${INPUT_PER_M}/$${OUTPUT_PER_M} per million tokens; cached tokens make the real bill slightly lower.`,
    },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle="Environment and app status" />
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
        </div>
      </main>
    </>
  );
}
