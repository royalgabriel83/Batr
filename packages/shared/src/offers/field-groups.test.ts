import { describe, expect, it } from "vitest";
import {
  EDITABLE_OFFER_FIELDS,
  OFFER_FIELD_GROUPS,
  changedOfferFields,
  contentVersionAfter,
  isMaterialChange,
} from "./field-groups.ts";
import { EMPTY_OFFER_FIELDS, OfferFieldsSchema } from "./schemas.ts";

describe("offer field groups", () => {
  it("classifies every editable field, and nothing else", () => {
    const expected = [...Object.keys(OfferFieldsSchema.shape), "photo_set", "photo_order", "photo_alt_text"].sort();
    expect([...EDITABLE_OFFER_FIELDS].sort()).toEqual(expected);
  });

  it("matches specs/milestone-1.md (Offer fields: three groups)", () => {
    expect(OFFER_FIELD_GROUPS).toEqual({
      // Milestone 9, V7.
      offer_type: "material",
      title: "material",
      description: "material",
      condition: "material",
      offering_text: "material",
      photo_set: "material",
      wants_text: "preference",
      area: "preference",
      exchange_mode: "preference",
      handover_methods: "preference",
      category: "discovery",
      photo_order: "discovery",
      photo_alt_text: "discovery",
    });
  });
});

describe("content_version", () => {
  it("rises once for an edit that changes several material fields", () => {
    expect(contentVersionAfter(4, ["title", "description", "photo_set"])).toBe(5);
  });

  it("does not change for preference or discovery edits", () => {
    expect(contentVersionAfter(4, ["wants_text", "category", "photo_order", "photo_alt_text"])).toBe(4);
    expect(isMaterialChange([])).toBe(false);
  });

  it("rises once when material and non-material fields change together", () => {
    expect(contentVersionAfter(1, ["wants_text", "condition", "category"])).toBe(2);
  });
});

describe("changedOfferFields", () => {
  const before = { ...EMPTY_OFFER_FIELDS, title: "Road bike", category: "sports_outdoors" as const };

  it("lists only fields whose value differs", () => {
    expect(changedOfferFields(before, { title: "Road bike", wants_text: "A tent", category: "other" })).toEqual([
      "wants_text",
      "category",
    ]);
  });

  it("ignores undefined values", () => {
    expect(changedOfferFields(before, { title: undefined })).toEqual([]);
  });
});
