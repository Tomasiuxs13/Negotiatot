/**
 * One place that decides what money looks like. Every price on screen goes through
 * here, so the symbol can't drift between the Playbook, the deal page and the message
 * a creator actually reads.
 */
export const CURRENCY = "$";

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return CURRENCY + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function moneyCpm(n: number | null | undefined): string {
  if (n == null) return "—";
  return (
    CURRENCY + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

export function views(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

/**
 * Parses a decimal the way a person typed it, not the way JavaScript expects it.
 *
 * An engagement rate copied from a report reads "11,45" in half of Europe, and a
 * `type="number"` input plus `Number()` rejects it twice over — the browser refuses the
 * comma keystroke, and the parser turns it into NaN. This accepts both separators:
 * when only one kind is present it is the decimal mark; when both appear ("1,234.56")
 * the commas are thousands separators and are dropped.
 *
 * Returns null for empty or unparseable input — the caller decides whether that is
 * "not provided" or an error. Rounded to 2 decimals: more precision than that in an
 * engagement rate is noise pretending to be signal.
 */
export function parseDecimal(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = raw.trim().replace(/\s+/g, "");
  if (s === "") return null;
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(",", ".");
  }
  // parseFloat would silently accept "11.4abc"; a full-string match refuses it.
  if (!/^-?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * "6d ago" — compact elapsed time for places a full "6 days ago" won't fit, like the
 * figures line on a board card. Counts whole calendar days, so outreach sent at 23:00
 * yesterday reads "1d ago" rather than "today". `today` is injectable for tests.
 */
export function shortAgo(
  timestamp: string | null | undefined,
  today: string = new Date().toISOString().slice(0, 10)
): string | null {
  if (!timestamp) return null;
  const then = new Date(timestamp.slice(0, 10) + "T00:00:00Z").getTime();
  const now = new Date(today.slice(0, 10) + "T00:00:00Z").getTime();
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  const days = Math.round((now - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days < 60) return `${days}d ago`;
  return `${Math.round(days / 30)}mo ago`;
}
