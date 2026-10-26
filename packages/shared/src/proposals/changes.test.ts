import { describe, expect, it } from "vitest";
import { CHANGE_CHIPS, differsMaterially, itemKey, termsChanges, type ComparableTerms } from "./changes.ts";

const base: ComparableTerms = {
  gives: [{ kind: "offer", offer_id: "a", content_version: 1 }, { kind: "text", description: "A charger" }],
  gets: [{ kind: "offer", offer_id: "b", content_version: 3 }],
  cash: null,
  note: "",
};

describe("change chips", () => {
  it("names items by offer or exact description", () => {
    expect(itemKey({ kind: "offer", offer_id: "a" })).toBe("offer:a");
    expect(itemKey({ kind: "text", description: "Pen" })).toBe("text:Pen");
    expect(CHANGE_CHIPS.cash).toBe("Cash changed");
  });

  it("finds nothing between equal terms, and ignores item order", () => {
    const reordered = { ...base, gives: [...base.gives].reverse() };
    expect(termsChanges(base, reordered)).toEqual({ chips: [], added: [], removed: [], updated: [] });
    expect(differsMaterially(base, reordered)).toBe(false);
  });

  it("reports added, removed and updated items, cash and note in chip order", () => {
    const next: ComparableTerms = {
      gives: [{ kind: "offer", offer_id: "a", content_version: 2 }, { kind: "text", description: "A cable" }],
      gets: [{ kind: "offer", offer_id: "b", content_version: 3 }],
      cash: { amount_naira: 5000, payer: "owner" },
      note: "Deal?",
    };
    const changes = termsChanges(base, next);
    expect(changes.chips).toEqual(["added", "removed", "updated", "cash", "note"]);
    expect(changes.added).toEqual([{ kind: "text", description: "A cable" }]);
    expect(changes.removed).toEqual([{ kind: "text", description: "A charger" }]);
    expect(changes.updated).toEqual([{ kind: "offer", offer_id: "a", content_version: 2 }]);
  });

  it("treats unknown content versions as unchanged, and a changed payer as cash changed", () => {
    const withCash = { ...base, cash: { amount_naira: 5000, payer: "owner" as const } };
    const input: ComparableTerms = {
      gives: [{ kind: "offer", offer_id: "a" }, { kind: "text", description: "A charger" }],
      gets: [{ kind: "offer", offer_id: "b" }],
      cash: { amount_naira: 5000, payer: "proposer" },
    };
    expect(termsChanges(withCash, input).chips).toEqual(["cash"]);
    expect(termsChanges(input, withCash).chips).toEqual(["cash"]);
  });

  it("refuses a note-only change as a counter, and shows no chip for a cleared note", () => {
    expect(differsMaterially(base, { ...base, note: "Please?" })).toBe(false);
    expect(termsChanges(base, { ...base, note: "Please?" }).chips).toEqual(["note"]);
    expect(termsChanges({ ...base, note: "Please?" }, { ...base, note: "" }).chips).toEqual([]);
    expect(termsChanges({ ...base, note: undefined }, { ...base, note: undefined }).chips).toEqual([]);
    expect(termsChanges({ ...base, note: "Hi" }, { ...base, note: undefined }).chips).toEqual([]);
    expect(termsChanges({ ...base, note: undefined }, { ...base, note: "Hi" }).chips).toEqual(["note"]);
    expect(differsMaterially(base, { ...base, gets: [...base.gets, { kind: "text", description: "Case" }] })).toBe(true);
  });

  it("counts an offer moved to the other side as removed and added", () => {
    const moved: ComparableTerms = { ...base, gives: [{ kind: "text", description: "A charger" }], gets: [...base.gets, { kind: "offer", offer_id: "a", content_version: 1 }] };
    expect(termsChanges(base, moved).chips).toEqual(["added", "removed"]);
  });
});
