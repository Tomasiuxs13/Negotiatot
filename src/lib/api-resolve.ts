/**
 * Turning what a script knows (a handle) into what the app needs (a deal id), and
 * validating the enums a script can get wrong.
 *
 * Pure: rows in, verdict out. The routes stay thin and these rules get tested without
 * HTTP, which matters because the failure they prevent is silent — a free-text decline
 * reason writes a value the UI cannot display, and a wrong id declines the wrong deal.
 */

import { ALL_STAGES, DECLINE_REASONS, TERMINAL_STAGES, type DeclineReason, type Stage } from "./types";

/** The public shape of a handle lookup — enough to answer "in the pipeline, and where?". */
export interface HandleMatch {
  handle: string;
  id: number | null;
  stage: Stage | null;
  /** True when the deal is still live; a completed/declined match is history, not a clash. */
  live: boolean;
  /** Set when one handle matches several deals, so the caller never guesses. */
  ambiguous?: { id: number; stage: Stage }[];
}

type DealRow = { id: number; creator: string; stage: Stage; updated_at?: string };

/**
 * Matches a handle to a deal by creator name, case-insensitively and ignoring a leading
 * "@" — a script reading handles off YouTube or a spreadsheet will supply either form.
 *
 * A creator with more than one deal is reported as `ambiguous` rather than resolved to a
 * guess: the live one is returned as the answer when exactly one is live, because that is
 * unambiguous in the sense the caller cares about, but every candidate is listed so a
 * decline can never land on the wrong record.
 */
export function matchHandles(handles: string[], deals: DealRow[]): HandleMatch[] {
  const byName = new Map<string, DealRow[]>();
  for (const d of deals) {
    const key = normalizeHandle(d.creator);
    const list = byName.get(key);
    if (list) list.push(d);
    else byName.set(key, [d]);
  }

  return handles.map((raw) => {
    const handle = raw.trim();
    const found = byName.get(normalizeHandle(handle)) ?? [];
    if (found.length === 0) return { handle, id: null, stage: null, live: false };

    const liveOnes = found.filter((d) => !TERMINAL_STAGES.includes(d.stage));
    // One live deal is the answer even when closed history exists alongside it.
    const chosen = liveOnes.length === 1 ? liveOnes[0] : found.length === 1 ? found[0] : null;
    if (chosen) {
      return {
        handle,
        id: chosen.id,
        stage: chosen.stage,
        live: !TERMINAL_STAGES.includes(chosen.stage),
        ...(found.length > 1
          ? { ambiguous: found.map((d) => ({ id: d.id, stage: d.stage })) }
          : {}),
      };
    }
    return {
      handle,
      id: null,
      stage: null,
      live: liveOnes.length > 0,
      ambiguous: found.map((d) => ({ id: d.id, stage: d.stage })),
    };
  });
}

export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

const REASON_KEYS = DECLINE_REASONS.map((r) => r.key);
/** Label → key, so a caller may send either "Went quiet" or "no_reply". */
const REASON_BY_LABEL = new Map(DECLINE_REASONS.map((r) => [r.label.toLowerCase(), r.key]));

/**
 * Accepts a decline reason in either form the manager sees or the database stores, and
 * refuses anything else. Free text must not pass: the UI renders the reason from a fixed
 * map, so an unrecognised value shows as blank and the deal looks declined for no stated
 * cause.
 */
export function parseDeclineReason(value: unknown): { ok: true; reason: DeclineReason } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `reason is required — one of: ${REASON_KEYS.join(", ")}` };
  }
  const raw = value.trim();
  if ((REASON_KEYS as string[]).includes(raw)) return { ok: true, reason: raw as DeclineReason };
  const byLabel = REASON_BY_LABEL.get(raw.toLowerCase());
  if (byLabel) return { ok: true, reason: byLabel };
  return {
    ok: false,
    error: `unknown reason "${raw}" — use one of: ${REASON_KEYS.join(", ")}`,
  };
}

export function parseStage(value: unknown): { ok: true; stage: Stage } | { ok: false; error: string } {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `stage is required — one of: ${ALL_STAGES.join(", ")}` };
  }
  const raw = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((ALL_STAGES as readonly string[]).includes(raw)) return { ok: true, stage: raw as Stage };
  return { ok: false, error: `unknown stage "${value}" — use one of: ${ALL_STAGES.join(", ")}` };
}

/** Shared by both mutating routes: an item names its target by id or by handle, never both blank. */
export function resolveTarget(
  item: { id?: unknown; handle?: unknown },
  matches: Map<string, HandleMatch>
): { ok: true; id: number; handle?: string } | { ok: false; error: string } {
  if (typeof item.id === "number" && Number.isInteger(item.id) && item.id > 0) {
    return { ok: true, id: item.id };
  }
  if (typeof item.handle === "string" && item.handle.trim()) {
    const match = matches.get(normalizeHandle(item.handle));
    if (!match || match.id == null) {
      return {
        ok: false,
        error: match?.ambiguous
          ? `handle "${item.handle}" matches ${match.ambiguous.length} deals — send an explicit id`
          : `handle "${item.handle}" is not in the pipeline`,
      };
    }
    return { ok: true, id: match.id, handle: item.handle.trim() };
  }
  return { ok: false, error: "each item needs an id or a handle" };
}
