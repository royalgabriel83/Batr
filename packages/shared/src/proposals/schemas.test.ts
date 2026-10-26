import { describe, expect, it } from "vitest";
import { checkInput } from "../offers/schemas.ts";
import {
  AcceptProposalInputSchema,
  CounterProposalInputSchema,
  CreateProposalInputSchema,
  ITEM_MESSAGES,
  ProposalActionInputSchema,
  TermsInputSchema,
  formatNaira,
} from "./schemas.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const terms = {
  gives: [{ kind: "offer", offer_id: A }, { kind: "text", description: "  A phone charger  " }],
  gets: [{ kind: "offer", offer_id: B }],
};

describe("proposal terms", () => {
  it("accepts offers and described items, trims text and defaults cash and note", () => {
    const checked = checkInput(TermsInputSchema, terms);
    expect(checked).toEqual({
      ok: true,
      data: { gives: [{ kind: "offer", offer_id: A }, { kind: "text", description: "A phone charger" }], gets: [{ kind: "offer", offer_id: B }], cash: null, note: "" },
    });
  });

  it("keeps each side to 1–3 items", () => {
    expect(checkInput(TermsInputSchema, { ...terms, gives: [] })).toEqual({ ok: false, errors: { gives: ITEM_MESSAGES.sideEmpty } });
    const four = Array.from({ length: 4 }, (_, i) => ({ kind: "text", description: `Item ${String(i)}` }));
    expect(checkInput(TermsInputSchema, { ...terms, gets: four })).toEqual({ ok: false, errors: { gets: ITEM_MESSAGES.sideFull } });
  });

  it("checks described items, the note and cash", () => {
    const short = checkInput(TermsInputSchema, { ...terms, gives: [{ kind: "text", description: " ab " }] });
    expect(short).toEqual({ ok: false, errors: { gives: ITEM_MESSAGES.textTooShort } });
    const long = checkInput(TermsInputSchema, { ...terms, gives: [{ kind: "text", description: "x".repeat(201) }] });
    expect(long).toEqual({ ok: false, errors: { gives: ITEM_MESSAGES.textTooLong } });
    expect(checkInput(TermsInputSchema, { ...terms, note: "x".repeat(1001) })).toEqual({ ok: false, errors: { note: ITEM_MESSAGES.noteTooLong } });
    expect(checkInput(TermsInputSchema, { ...terms, cash: { amount_naira: 0, payer: "proposer" } })).toEqual({ ok: false, errors: { cash: ITEM_MESSAGES.cashMin } });
    expect(checkInput(TermsInputSchema, { ...terms, cash: { amount_naira: 100_000_001, payer: "owner" } })).toEqual({ ok: false, errors: { cash: ITEM_MESSAGES.cashMax } });
    expect(checkInput(TermsInputSchema, { ...terms, cash: { amount_naira: 10.5, payer: "owner" } })).toEqual({ ok: false, errors: { cash: ITEM_MESSAGES.cashWhole } });
    expect(checkInput(TermsInputSchema, { ...terms, cash: { amount_naira: 10, payer: "bank" } })).toEqual({ ok: false, errors: { cash: ITEM_MESSAGES.cashPayer } });
    expect(checkInput(TermsInputSchema, { ...terms, cash: { amount_naira: 20_000, payer: "proposer" } })).toMatchObject({ ok: true, data: { cash: { amount_naira: 20_000, payer: "proposer" } } });
  });

  it("refuses an offer twice, a second offer to get, unknown kinds and keys", () => {
    expect(checkInput(TermsInputSchema, { ...terms, gets: [{ kind: "offer", offer_id: A }] })).toEqual({ ok: false, errors: { gets: ITEM_MESSAGES.duplicate } });
    const two = { ...terms, gets: [{ kind: "offer", offer_id: B }, { kind: "offer", offer_id: C }] };
    expect(checkInput(TermsInputSchema, two)).toEqual({ ok: false, errors: { gets: ITEM_MESSAGES.getsOneOffer } });
    expect(checkInput(TermsInputSchema, { ...terms, gives: [{ kind: "money" }] }).ok).toBe(false);
    expect(checkInput(TermsInputSchema, { ...terms, extra: 1 })).toEqual({ ok: false, errors: { extra: "This field isn't accepted." } });
  });

  it("wraps terms for create, counter, accept, decline and withdraw", () => {
    expect(checkInput(CreateProposalInputSchema, { offer_id: B, ...terms }).ok).toBe(true);
    expect(checkInput(CreateProposalInputSchema, terms).ok).toBe(false);
    expect(checkInput(CreateProposalInputSchema, { offer_id: B, ...terms, gets: [{ kind: "offer", offer_id: A }] }).ok).toBe(false);
    expect(checkInput(CounterProposalInputSchema, { expected_revision: 2, ...terms }).ok).toBe(true);
    expect(checkInput(CounterProposalInputSchema, { expected_revision: 0, ...terms }).ok).toBe(false);
    expect(checkInput(AcceptProposalInputSchema, { revision_id: A }).ok).toBe(true);
    expect(checkInput(AcceptProposalInputSchema, { revision_id: "1" }).ok).toBe(false);
    expect(checkInput(ProposalActionInputSchema, { expected_revision: 3 }).ok).toBe(true);
    expect(checkInput(ProposalActionInputSchema, {}).ok).toBe(false);
  });

  it("formats naira with separators", () => {
    expect(formatNaira(20000)).toBe("₦20,000");
    expect(formatNaira(100_000_000)).toBe("₦100,000,000");
  });
});
