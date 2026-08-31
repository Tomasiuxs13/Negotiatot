/**
 * How a record page (a deal, a creator) arranges itself.
 *
 * "Workspace" is the CRM shape: a properties column on the left, the work in the middle,
 * related records on the right — so what the deal IS stays on screen while you move
 * between the thread, the verdict and the paperwork. "Classic" is the layout this app
 * had before it: one wide body beside a single rail.
 *
 * A setting rather than a rewrite, because a layout is a working habit. Switching back
 * is one click and no deploy, and both layouts render the same blocks — nothing is only
 * reachable from one of them.
 */
export type RecordLayout = "workspace" | "classic";

export const DEFAULT_RECORD_LAYOUT: RecordLayout = "workspace";

export const RECORD_LAYOUTS: { value: RecordLayout; label: string; note: string }[] = [
  {
    value: "workspace",
    label: "Workspace",
    note: "Three columns: what the deal is, the work, who it is with.",
  },
  {
    value: "classic",
    label: "Classic",
    note: "One wide body beside a single rail, with the numbers across the top.",
  },
];

export function parseRecordLayout(value: unknown): RecordLayout {
  return value === "classic" || value === "workspace" ? value : DEFAULT_RECORD_LAYOUT;
}
