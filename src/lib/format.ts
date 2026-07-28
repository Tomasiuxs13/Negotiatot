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
