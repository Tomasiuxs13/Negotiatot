"use client";

import { useState, useTransition } from "react";
import type { Deal, Stage } from "@/lib/types";
import type { DealPhase } from "@/lib/deal-phase";
import { STAGES, STAGE_HELP } from "@/lib/types";
import DealCard from "./DealCard";
import { moveDealStage } from "@/app/pipeline-actions";

const COMPLETED_PREVIEW = 5;

export default function PipelineBoard({
  deals,
  phases = {},
  outreach = {},
}: {
  deals: Deal[];
  phases?: Record<number, DealPhase>;
  /** Per-deal "Follow-up 2 · 3d ago", for contacted cards. */
  outreach?: Record<number, string>;
}) {
  // Optimistic local copy so cards move instantly on drop.
  const [items, setItems] = useState(deals);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const moveItem = (id: number | null, stage: Stage) => {
    if (id == null) return;
    const deal = items.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    setError(null);
    setMovingId(id);
    setItems((prev) => prev.map((d) => (d.id === id ? { ...d, stage } : d)));
    startTransition(async () => {
      const result = await moveDealStage(id, stage);
      if (result.error) {
        setItems(deals);
        setError(`${deal.creator}: ${result.error}`);
      }
      setMovingId(null);
    });
  };

  const onDrop = (stage: Stage) => {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    moveItem(id, stage);
  };

  return (
    <div className="max-w-full overflow-x-auto">
      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="flex h-[calc(100vh-310px)] min-h-[480px] gap-3 pb-4">
      {STAGES.map((stage) => {
        const stageDeals = items.filter((d) => d.stage === stage.key);
        const isOver = overStage === stage.key;
        // Completed deals stay droppable but don't pile up forever — the column shows the
        // most recent few and sends you to the list for the rest.
        const capped = stage.key === "completed" && stageDeals.length > COMPLETED_PREVIEW;
        const visible = capped ? stageDeals.slice(0, COMPLETED_PREVIEW) : stageDeals;
        return (
          <div
            key={stage.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (overStage !== stage.key) setOverStage(stage.key);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverStage(null);
            }}
            onDrop={() => onDrop(stage.key)}
            className={`flex-1 min-w-64 flex flex-col rounded-xl p-2 border transition-colors ${
              isOver
                ? "bg-brand/5 border-brand/40"
                : "bg-slate-100/50 border-slate-200/60"
            }`}
          >
            <div className="flex items-start justify-between gap-2 px-2 py-2.5 mb-1">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="label-caps text-slate-700">{stage.label}</h3>
                  <span className="font-data text-xs text-slate-400">{stageDeals.length}</span>
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                  {STAGE_HELP[stage.key].description}
                </p>
              </div>
              {(["lead", "contacted", "analyzing"] as Stage[]).includes(stage.key) && (
                <a
                  href={`/new?stage=${stage.key}`}
                  className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded p-1 transition-colors"
                  aria-label={`Add deal to ${stage.label}`}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
                </a>
              )}
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 px-1 pt-3 custom-scrollbar">
              {visible.map((deal) => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => setDragId(deal.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  className={dragId === deal.id ? "opacity-40" : ""}
                >
                  <DealCard
                    deal={deal}
                    phase={phases[deal.id]}
                    outreach={outreach[deal.id]}
                    moving={movingId === deal.id}
                    onMove={(next) => moveItem(deal.id, next)}
                  />
                </div>
              ))}
              {capped && (
                <a
                  href={`/pipeline?view=list&stage=${stage.key}`}
                  className="block text-xs text-slate-500 hover:text-slate-800 text-center py-2 border border-dashed border-slate-200 rounded-lg"
                >
                  View all {stageDeals.length} completed →
                </a>
              )}
              {stageDeals.length === 0 && (
                <div
                  className={`h-16 rounded-lg border border-dashed transition-colors ${
                    isOver ? "border-brand/50 bg-brand/5" : "border-slate-200"
                  }`}
                />
              )}
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
