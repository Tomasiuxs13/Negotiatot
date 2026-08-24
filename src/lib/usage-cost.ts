/**
 * Structural, rather than importing UsageTotals from db.ts, so that db.ts can price a
 * row as it writes it without the two modules importing each other.
 */
export interface TokenCounts {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Opus-tier list prices, USD per million tokens. Identical for claude-opus-5 and
 * claude-opus-4-8, so a mixed history still prices correctly.
 */
const INPUT_PER_M = 5;
const OUTPUT_PER_M = 25;
/** Writing to cache costs a premium; reading from it is a tenth of input. */
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

/**
 * What the logged usage actually cost.
 *
 * Input tokens alone are not the bill. The API reports input_tokens as the UNCACHED
 * remainder, so once a cache breakpoint exists that figure collapses — a real analysis
 * logged 2 — while the tokens themselves moved into the cache counters. Pricing on
 * input_tokens alone made the most expensive call in the product look free.
 */
export function usageCostUsd(u: TokenCounts): number {
  return (
    (u.inputTokens / 1_000_000) * INPUT_PER_M +
    (u.outputTokens / 1_000_000) * OUTPUT_PER_M +
    ((u.cacheCreationTokens ?? 0) / 1_000_000) * INPUT_PER_M * CACHE_WRITE_MULTIPLIER +
    ((u.cacheReadTokens ?? 0) / 1_000_000) * INPUT_PER_M * CACHE_READ_MULTIPLIER
  );
}

/** Every token the call consumed, cached or not — the figure to show beside the cost. */
export function totalTokens(u: TokenCounts): number {
  return u.inputTokens + u.outputTokens + (u.cacheCreationTokens ?? 0) + (u.cacheReadTokens ?? 0);
}
