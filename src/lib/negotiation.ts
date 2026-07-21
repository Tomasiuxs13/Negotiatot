import type { Deal, Message, CopilotReco } from "./types";
import { euro } from "./format";

export interface Round {
  round: string;
  amount: number;
  label: string;
  detail: string;
}

/** Reconstructs the round-by-round offer history from the message log. */
export function buildRounds(
  deal: Pick<Deal, "first_ask" | "avg_views">,
  messages: Pick<Message, "sender" | "meta">[],
  reco: Pick<CopilotReco, "round" | "proposedOffer"> | null
): Round[] {
  const rounds: Round[] = [];
  let r = 1;
  if (deal.first_ask != null) {
    const cpm = deal.avg_views ? `€${((deal.first_ask / deal.avg_views) * 1000).toFixed(2)} CPM` : "";
    rounds.push({ round: "R1", amount: deal.first_ask, label: "their ask", detail: cpm });
  }
  for (const m of messages) {
    if (m.sender === "copilot" || !m.meta) continue;
    const meta = JSON.parse(m.meta) as { offer?: number; counter?: number };
    if (m.sender === "us" && meta.offer != null) {
      const cpm = deal.avg_views ? `€${((meta.offer / deal.avg_views) * 1000).toFixed(2)} CPM` : "";
      rounds.push({ round: `R${r}`, amount: meta.offer, label: "our offer", detail: cpm });
    }
    if (m.sender === "them" && meta.counter != null) {
      r += 1;
      const prev = rounds.filter((x) => x.label === "their ask" || x.label === "their counter").at(-1);
      const moved = prev ? `moved ${euro(Math.abs(prev.amount - meta.counter))}` : "";
      rounds.push({ round: `R${r}`, amount: meta.counter, label: "their counter", detail: moved });
    }
  }
  if (reco) {
    rounds.push({ round: `R${reco.round}`, amount: reco.proposedOffer, label: "proposed", detail: "pending" });
  }
  return rounds;
}

/** The current gap between their latest position and our latest offer/proposal. */
export function currentGap(rounds: Round[]): number | null {
  const lastTheirs = rounds.filter((x) => x.label.startsWith("their")).at(-1);
  const lastOurs = rounds.filter((x) => x.label === "proposed" || x.label === "our offer").at(-1);
  return lastTheirs && lastOurs ? lastTheirs.amount - lastOurs.amount : null;
}
