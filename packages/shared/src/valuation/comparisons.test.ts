import { describe, expect, it } from "vitest";
import { adjustedPrice, comparisonRange } from "./comparisons.ts";

describe("comparison adjustments", () => {
  it("adds the adjustments and rounds half up to the kobo", () => {
    expect(adjustedPrice(10_000_000, [])).toBe(10_000_000);
    expect(adjustedPrice(10_000_000, [{ percent_bp: -1500 }, { percent_bp: 500 }])).toBe(9_000_000);
    expect(adjustedPrice(333, [{ percent_bp: -5000 }])).toBe(167);
  });

  it("never goes below zero", () => {
    expect(adjustedPrice(1000, [{ percent_bp: -9000 }, { percent_bp: -9000 }])).toBe(0);
  });

  it("summarises only included comparisons", () => {
    const range = comparisonRange([
      { price_kobo: 100, adjustments: [] },
      { price_kobo: 300, adjustments: [] },
      { price_kobo: 200, adjustments: [] },
      { price_kobo: 9_999, adjustments: [], excluded: true },
    ]);
    expect(range).toEqual({ count: 3, low: 100, median: 200, high: 300 });
    expect(comparisonRange([{ price_kobo: 101, adjustments: [] }, { price_kobo: 200, adjustments: [] }])?.median).toBe(151);
    expect(comparisonRange([{ price_kobo: 5, adjustments: [], excluded: true }])).toBeNull();
  });
});
