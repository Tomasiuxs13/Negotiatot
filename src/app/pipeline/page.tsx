import Link from "next/link";
import PageHeader, { NewDealButton } from "@/components/PageHeader";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import DealsTable from "@/components/pipeline/DealsTable";
import { getDeals } from "@/lib/db";
import { dealPlatforms } from "@/lib/types";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "All" },
  { key: "youtube", label: "YouTube" },
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; view?: string; stage?: string }>;
}) {
  const { platform = "", view = "board", stage = "" } = await searchParams;
  const isList = view === "list";

  const all = getDeals();
  let deals = platform
    ? all.filter((d) => dealPlatforms(d).includes(platform as never))
    : all;
  if (stage) deals = deals.filter((d) => d.stage === stage);

  const query = (over: Record<string, string>) => {
    const params = new URLSearchParams();
    const merged = { platform, view, stage, ...over };
    for (const [k, v] of Object.entries(merged)) {
      if (v && !(k === "view" && v === "board")) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/pipeline?${qs}` : "/pipeline";
  };

  return (
    <>
      <PageHeader
        title="Pipeline"
        subtitle="Every deal and where it stands"
        actions={
          <>
            {/* View toggle — same deals, two ways to read them. */}
            <div className="flex bg-slate-100 rounded-md p-0.5">
              {[
                { key: "board", label: "Board", icon: "view_kanban" },
                { key: "list", label: "List", icon: "view_list" },
              ].map((v) => (
                <Link
                  key={v.key}
                  href={query({ view: v.key })}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded transition-colors ${
                    (v.key === "list") === isList
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                    {v.icon}
                  </span>
                  {v.label}
                </Link>
              ))}
            </div>

            <div className="hidden lg:flex gap-1.5">
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={query({ platform: f.key })}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    platform === f.key
                      ? "bg-slate-900 text-white border-slate-900"
                      : "border-slate-200 text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {f.label}
                </Link>
              ))}
            </div>
            <NewDealButton />
          </>
        }
      />

      <main className="flex-1 overflow-x-auto overflow-y-auto p-8">
        {stage && (
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-slate-500">Filtered to one stage</span>
            <Link href={query({ stage: "" })} className="text-brand-dark font-medium hover:underline">
              Clear
            </Link>
          </div>
        )}
        {isList ? <DealsTable deals={deals} /> : <PipelineBoard deals={deals} />}
      </main>
    </>
  );
}
