import PageHeader from "@/components/PageHeader";
import { getDeals } from "@/lib/db";
import { hasApiKey } from "@/lib/claude";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const keyConfigured = hasApiKey();
  const dealCount = getDeals().length;

  const rows = [
    {
      label: "Claude API key",
      value: keyConfigured ? "Configured ✓" : "Missing",
      tone: keyConfigured ? "text-emerald-600" : "text-red-600",
      note: "Set via ANTHROPIC_API_KEY in counterpart/.env.local — restart the dev server after changing it.",
    },
    {
      label: "Model",
      value: "claude-opus-4-8",
      tone: "text-slate-900",
      note: "Used for analysis, recommendations, and report/screenshot parsing, with adaptive thinking and web research.",
    },
    {
      label: "Database",
      value: `SQLite · ${dealCount} deals`,
      tone: "text-slate-900",
      note: "Stored locally at counterpart/data/counterpart.db — back this file up to keep your deal history.",
    },
    {
      label: "Currency",
      value: "EUR",
      tone: "text-slate-900",
      note: "All prices and playbook thresholds are in euros.",
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
