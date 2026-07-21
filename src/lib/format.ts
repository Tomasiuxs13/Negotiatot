export function euro(n: number | null | undefined): string {
  if (n == null) return "—";
  return "€" + n.toLocaleString("en-IE", { maximumFractionDigits: 0 });
}

export function euroCpm(n: number | null | undefined): string {
  if (n == null) return "—";
  return "€" + n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function views(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
