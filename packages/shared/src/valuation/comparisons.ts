import { applyBasisPoints } from "./fees.ts";

// Market comparisons recorded by a reviewer (owner, 2026-10-17). Each
// adjustment is a percentage in basis points; they add up, and the
// adjusted price is price × (100% + total), rounded half up to the kobo.
// private.comparison_adjusted_kobo applies the same rule (parity test).

export interface ComparisonPrice {
  price_kobo: number;
  adjustments: readonly { percent_bp: number }[];
  excluded?: boolean;
}

/** The comparison's price after the reviewer's adjustments. */
export function adjustedPrice(price: number, adjustments: readonly { percent_bp: number }[]): number {
  const total = adjustments.reduce((sum, adjustment) => sum + adjustment.percent_bp, 0);
  const factor = Math.max(0, 10_000 + total);
  return applyBasisPoints(price, factor);
}

export interface ComparisonRange {
  count: number;
  low: number;
  median: number;
  high: number;
}

/** Low, median and high of the included comparisons' adjusted prices; null with none included. */
export function comparisonRange(comparisons: readonly ComparisonPrice[]): ComparisonRange | null {
  const values = comparisons
    .filter((comparison) => !comparison.excluded)
    .map((comparison) => adjustedPrice(comparison.price_kobo, comparison.adjustments))
    .sort((a, b) => a - b);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 1 ? (values[middle] ?? 0) : Math.floor(((values[middle - 1] ?? 0) + (values[middle] ?? 0) + 1) / 2);
  return { count: values.length, low: values[0] ?? 0, median, high: values.at(-1) ?? 0 };
}
