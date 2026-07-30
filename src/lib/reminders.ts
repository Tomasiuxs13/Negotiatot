/**
 * The manager's own follow-ups, attached to a partner or a deal.
 *
 * These exist for promises only a human knows about — "they said try again in three
 * months" lives in nobody's data, so no derived worklist can ever surface it. The rest
 * of the attention panel is computed from state; a reminder is the one item the manager
 * writes down themselves.
 */

export interface Reminder {
  id: number;
  title: string;
  /** Calendar date (YYYY-MM-DD) it becomes actionable — not a timestamp. */
  due_on: string;
  partner_id: number | null;
  deal_id: number | null;
  status: "open" | "done";
  done_at: string | null;
  created_at: string;
}

/** Open reminders whose date has arrived — the ones worth interrupting the day for. */
export function dueReminders(reminders: Reminder[], today: string): Reminder[] {
  return reminders
    .filter((r) => r.status === "open" && r.due_on.slice(0, 10) <= today)
    .sort((a, b) => a.due_on.localeCompare(b.due_on));
}

/** Where a reminder's subject lives — a deal page beats a partner page when it has both. */
export function reminderHref(r: Pick<Reminder, "deal_id" | "partner_id">): string {
  if (r.deal_id != null) return `/deals/${r.deal_id}`;
  if (r.partner_id != null) return `/partners/${r.partner_id}`;
  return "/";
}
