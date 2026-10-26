// BATR's platform fee (owner, 2026-10-17). One 3% fee on the applicable
// exchange value, calculated once and borne equally by the two parties.
// The database function private.platform_fee applies the same rules;
// supabase/tests/parity.db.test.ts keeps the two identical.
//
// All amounts are integers in the currency's minor unit (kobo for
// naira), so no floating-point arithmetic is ever used for money.
//
// Rounding rule (documented in specs/valuation-and-fees.md):
// - The total fee is basis × fee rate, rounded half up to the nearest
//   minor unit.
// - The two shares always add up exactly to the total: when the total
//   is an odd number of kobo, party A (the offer owner) bears the extra
//   kobo. Which party bears it is a launch policy decision; this is
//   the default until the owner decides.

export const EXCHANGE_TYPES = {
  pure_barter: "Pure barter",
  cash_plus_barter: "Barter plus cash",
  cash_only: "Cash only",
} as const;
export type ExchangeType = keyof typeof EXCHANGE_TYPES;
export const EXCHANGE_TYPE_IDS = Object.keys(EXCHANGE_TYPES) as [ExchangeType, ...ExchangeType[]];

/** The fee policy in force. A new version is added, never edited, so accepted quotes keep theirs. */
export const FEE_POLICY = {
  version: "fees-2026-10-17",
  /** 3% in basis points. */
  feeBasisPoints: 300,
  /** Each party's share of the total fee, in basis points of the fee. */
  partyShareBasisPoints: 5000,
  currency: "NGN",
} as const;

export interface FeeInput {
  exchangeType: ExchangeType;
  /** BATR's approved value of the goods, services and skills (0 for cash only). */
  assessedNonCash: number;
  /** The agreed cash: the extra cash in barter plus cash, the whole value in cash only, 0 in pure barter. */
  agreedCash: number;
  feeBasisPoints?: number;
}

export interface FeeBreakdown {
  exchangeType: ExchangeType;
  assessedNonCash: number;
  agreedCash: number;
  feeBasis: number;
  feeBasisPoints: number;
  totalFee: number;
  partyAShare: number;
  partyBShare: number;
  policyVersion: string;
}

export class FeeInputError extends Error {
  constructor(readonly field: "assessedNonCash" | "agreedCash" | "exchangeType", message: string) {
    super(message);
  }
}

const isAmount = (value: number) => Number.isSafeInteger(value) && value >= 0;

/** Basis × rate / 10,000, rounded half up, in integer arithmetic. */
export function applyBasisPoints(amount: number, basisPoints: number): number {
  const product = BigInt(amount) * BigInt(basisPoints);
  return Number((product + 5000n) / 10000n);
}

/**
 * The fee basis, the total 3% fee and each party's share.
 *
 * - Pure barter: basis = assessed non-cash value; there is no cash.
 * - Barter plus cash: basis = assessed non-cash value + agreed cash,
 *   counted once. No second fee is charged on the cash.
 * - Cash only: basis = the agreed cash value; there is nothing to assess.
 */
export function calculatePlatformFee(input: FeeInput): FeeBreakdown {
  const { exchangeType, assessedNonCash, agreedCash } = input;
  const feeBasisPoints = input.feeBasisPoints ?? FEE_POLICY.feeBasisPoints;
  if (!(exchangeType in EXCHANGE_TYPES)) throw new FeeInputError("exchangeType", "Unknown exchange type.");
  if (!isAmount(assessedNonCash)) throw new FeeInputError("assessedNonCash", "The assessed value must be a whole number of kobo, 0 or more.");
  if (!isAmount(agreedCash)) throw new FeeInputError("agreedCash", "The cash amount must be a whole number of kobo, 0 or more.");
  if (exchangeType === "pure_barter") {
    if (agreedCash !== 0) throw new FeeInputError("agreedCash", "A pure barter has no cash. Choose barter plus cash instead.");
    if (assessedNonCash === 0) throw new FeeInputError("assessedNonCash", "A pure barter needs an assessed value.");
  }
  if (exchangeType === "cash_plus_barter") {
    if (agreedCash === 0) throw new FeeInputError("agreedCash", "Barter plus cash needs a cash amount.");
    if (assessedNonCash === 0) throw new FeeInputError("assessedNonCash", "Barter plus cash needs an assessed value for the goods or services.");
  }
  if (exchangeType === "cash_only") {
    if (assessedNonCash !== 0) throw new FeeInputError("assessedNonCash", "A cash-only exchange has nothing to assess.");
    if (agreedCash === 0) throw new FeeInputError("agreedCash", "A cash-only exchange needs the agreed cash value.");
  }
  const feeBasis = exchangeType === "cash_only" ? agreedCash : assessedNonCash + agreedCash;
  if (!Number.isSafeInteger(feeBasis)) throw new FeeInputError("agreedCash", "The amounts are too large.");
  const totalFee = applyBasisPoints(feeBasis, feeBasisPoints);
  const partyBShare = Math.floor(totalFee / 2);
  const partyAShare = totalFee - partyBShare;
  return {
    exchangeType,
    assessedNonCash,
    agreedCash,
    feeBasis,
    feeBasisPoints,
    totalFee,
    partyAShare,
    partyBShare,
    policyVersion: FEE_POLICY.version,
  };
}

const wholeNaira = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
const nairaAndKobo = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 });

/** 150000 kobo → "₦1,500"; 150050 → "₦1,500.50". */
export function formatKobo(kobo: number): string {
  const naira = Math.trunc(kobo / 100);
  const rest = Math.abs(kobo % 100);
  return rest === 0 ? wholeNaira.format(naira) : nairaAndKobo.format(Number(`${String(naira)}.${String(rest).padStart(2, "0")}`));
}

/** "1,500.50" or "1500" → 150050 / 150000 kobo; null when it isn't a valid amount. */
export function parseNaira(text: string): number | null {
  const cleaned = text.replace(/[₦,\s]/g, "");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
