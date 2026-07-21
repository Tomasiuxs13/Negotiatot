"use client";

import { useEffect, useState, useTransition } from "react";
import type { Deal, Stage } from "@/lib/types";
import { STAGES } from "@/lib/types";
import DealCard from "./DealCard";
import { moveDealStage } from "@/app/pipeline-actions";

const COMPLETED_PREVIEW = 5;

export default function PipelineBoard({ deals }: { deals: Deal[] }) {
  // Optimistic local copy so cards move instantly on drop.
  const [items, setItems] = useState(deals);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  const [, startTransition] = useTransition();

  // Resync when the server sends fresh data (create/delete/navigation).
  useEffect(() => {
    setItems(deals);
  }, [deals]);

  const onDrop = (stage: Stage) => {
    setOverStage(null);
    const id = dragId;
    setDragId(null);
    if (id == null) return;
    const deal = items.find((d) => d.id === id);
    if (!deal || deal.stage === stage) return;
    setItems((prev) => prev.map((d) => (d.id === id ? { ...d, stage } : d)));
    startTransition(async () => {
      await moveDealStage(id, stage);
    });
  };

  return (
    <div className="flex gap-4 h-[calc(100vh-280px)] pb-4">
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
            className={`flex-1 min-w-56 flex flex-col rounded-xl p-2 border transition-colors ${
              isOver
                ? "bg-brand/5 border-brand/40"
                : "bg-slate-100/50 border-slate-200/60"
            }`}
          >
            <div className="flex items-center justify-between px-2 py-3 mb-2">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm text-slate-800">{stage.label}</h3>
                <span className="bg-slate-200 text-slate-600 text-xs font-medium px-2 py-0.5 rounded-full font-tabular">
                  {stageDeals.length}
                </span>
              </div>
              <a
                href={`/new?stage=${stage.key}`}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded p-1 transition-colors"
                aria-label={`Add deal to ${stage.label}`}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
              </a>
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
                  <DealCard deal={deal} />
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
                <div className="text-xs text-slate-400 text-center py-8 border border-dashed border-slate-200 rounded-lg">
                  {isOver ? "Drop here" : "No deals in this stage"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
