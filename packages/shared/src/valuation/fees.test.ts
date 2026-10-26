import { describe, expect, it } from "vitest";
import { FEE_POLICY, FeeInputError, applyBasisPoints, calculatePlatformFee, formatKobo, parseNaira } from "./fees.ts";

// The owner's examples (2026-10-17), in kobo: ₦100,000 = 10,000,000 kobo.
const NGN = (naira: number) => naira * 100;

describe("platform fee: the owner's examples", () => {
  it("pure barter: 3% of the assessed value, split equally", () => {
    const fee = calculatePlatformFee({ exchangeType: "pure_barter", assessedNonCash: NGN(100_000), agreedCash: 0 });
    expect(fee).toEqual({
      exchangeType: "pure_barter",
      assessedNonCash: NGN(100_000),
      agreedCash: 0,
      feeBasis: NGN(100_000),
      feeBasisPoints: 300,
      totalFee: NGN(3_000),
      partyAShare: NGN(1_500),
      partyBShare: NGN(1_500),
      policyVersion: FEE_POLICY.version,
    });
  });

  it("barter plus cash: one fee on the assessed value plus the cash", () => {
    const fee = calculatePlatformFee({ exchangeType: "cash_plus_barter", assessedNonCash: NGN(100_000), agreedCash: NGN(20_000) });
    expect(fee.feeBasis).toBe(NGN(120_000));
    expect(fee.totalFee).toBe(NGN(3_600));
    expect(fee.partyAShare).toBe(NGN(1_800));
    expect(fee.partyBShare).toBe(NGN(1_800));
  });

  it("barter plus cash never adds a second 3% on the cash", () => {
    const fee = calculatePlatformFee({ exchangeType: "cash_plus_barter", assessedNonCash: NGN(100_000), agreedCash: NGN(20_000) });
    const separate = applyBasisPoints(NGN(100_000), 300) + applyBasisPoints(NGN(20_000), 300) * 2;
    expect(fee.totalFee).not.toBe(separate);
    expect(fee.totalFee).toBe(applyBasisPoints(NGN(120_000), 300));
  });

  it("cash only: 3% of the agreed cash", () => {
    const fee = calculatePlatformFee({ exchangeType: "cash_only", assessedNonCash: 0, agreedCash: NGN(100_000) });
    expect(fee.feeBasis).toBe(NGN(100_000));
    expect(fee.totalFee).toBe(NGN(3_000));
    expect([fee.partyAShare, fee.partyBShare]).toEqual([NGN(1_500), NGN(1_500)]);
  });
});

describe("platform fee: rounding", () => {
  it("rounds the total half up to the kobo", () => {
    // 3% of 50 kobo is 1.5 kobo → 2; of 49 kobo is 1.47 → 1; of 16 kobo is 0.48 → 0.
    expect(calculatePlatformFee({ exchangeType: "cash_only", assessedNonCash: 0, agreedCash: 50 }).totalFee).toBe(2);
    expect(calculatePlatformFee({ exchangeType: "cash_only", assessedNonCash: 0, agreedCash: 49 }).totalFee).toBe(1);
    expect(calculatePlatformFee({ exchangeType: "cash_only", assessedNonCash: 0, agreedCash: 16 }).totalFee).toBe(0);
  });

  it("the two shares always add up exactly; party A bears an odd kobo", () => {
    for (const basis of [1, 33, 34, 50, 99, 1_234_567, 9_999_999_999, NGN(100_001)]) {
      const fee = calculatePlatformFee({ exchangeType: "pure_barter", assessedNonCash: basis, agreedCash: 0 });
      expect(fee.partyAShare + fee.partyBShare).toBe(fee.totalFee);
      expect(fee.partyAShare - fee.partyBShare).toBe(fee.totalFee % 2);
    }
  });

  it("is exact for the largest allowed amounts (no floating point)", () => {
    const fee = calculatePlatformFee({ exchangeType: "cash_plus_barter", assessedNonCash: 100_000_000_000_000, agreedCash: 33 });
    expect(fee.totalFee).toBe(3_000_000_000_000 + 1);
  });
});

describe("platform fee: exchange type rules", () => {
  const cases = [
    { exchangeType: "pure_barter", assessedNonCash: NGN(10), agreedCash: 1, field: "agreedCash" },
    { exchangeType: "pure_barter", assessedNonCash: 0, agreedCash: 0, field: "assessedNonCash" },
    { exchangeType: "cash_plus_barter", assessedNonCash: NGN(10), agreedCash: 0, field: "agreedCash" },
    { exchangeType: "cash_plus_barter", assessedNonCash: 0, agreedCash: NGN(10), field: "assessedNonCash" },
    { exchangeType: "cash_only", assessedNonCash: 1, agreedCash: NGN(10), field: "assessedNonCash" },
    { exchangeType: "cash_only", assessedNonCash: 0, agreedCash: 0, field: "agreedCash" },
    { exchangeType: "cash_only", assessedNonCash: 0, agreedCash: 1.5, field: "agreedCash" },
    { exchangeType: "pure_barter", assessedNonCash: -5, agreedCash: 0, field: "assessedNonCash" },
    { exchangeType: "swap", assessedNonCash: 5, agreedCash: 0, field: "exchangeType" },
  ] as const;
  it.each(cases)("refuses $exchangeType with $assessedNonCash + $agreedCash", ({ field, ...input }) => {
    // @ts-expect-error: the invalid exchange type is deliberate
    const run = () => calculatePlatformFee(input);
    expect(run).toThrow(FeeInputError);
    try {
      run();
    } catch (error) {
      expect((error as FeeInputError).field).toBe(field);
    }
  });
});

describe("naira formatting and parsing", () => {
  it("formats kobo as naira", () => {
    expect(formatKobo(150_000)).toBe("₦1,500");
    expect(formatKobo(150_050)).toBe("₦1,500.50");
    expect(formatKobo(5)).toBe("₦0.05");
  });
  it("parses naira text into kobo", () => {
    expect(parseNaira("1,500.50")).toBe(150_050);
    expect(parseNaira("₦ 100000")).toBe(10_000_000);
    expect(parseNaira("1.5")).toBe(150);
    expect(parseNaira("-1")).toBeNull();
    expect(parseNaira("1.234")).toBeNull();
    expect(parseNaira("abc")).toBeNull();
    expect(parseNaira("")).toBeNull();
  });
});
