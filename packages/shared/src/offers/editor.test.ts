import { describe, expect, it } from "vitest";
import { EMPTY_OFFER_FIELDS, PUBLISH_RULE_MESSAGES, type OfferFields } from "./schemas.ts";
import {
  changedFields,
  checkForm,
  conflictDifferences,
  errorMessage,
  filledFields,
  FORM_FIELD_ORDER,
  FORM_STEPS,
  firstInvalidField,
  formErrorsFrom,
  hasUnsavedChanges,
  stepErrors,
  stepOf,
  switchOfferType,
} from "./editor.ts";

const complete: OfferFields = {
  offer_type: "item",
  title: "Road bike",
  description: "Steel frame",
  category: "sports_outdoors",
  condition: "good",
  offering_text: "A road bike",
  wants_text: "A tent",
  area: null,
  exchange_mode: null,
  handover_methods: [],
};

describe("changedFields", () => {
  it("treats the same handover methods in another order as unchanged, and reports area and mode changes", () => {
    const saved = { ...complete, handover_methods: ["collection", "delivery"] as OfferFields["handover_methods"] };
    expect(changedFields(saved, { ...saved, handover_methods: ["delivery", "collection"] })).toEqual({});
    expect(changedFields(saved, { ...saved, area: "ibadan_bodija", exchange_mode: "in_person" })).toEqual({ area: "ibadan_bodija", exchange_mode: "in_person" });
  });
  it("returns only fields whose trimmed value differs", () => {
    expect(changedFields(complete, { ...complete, title: "  Road bike  ", wants_text: " A tent and pegs " })).toEqual({ wants_text: "A tent and pegs" });
  });
  it("includes category and condition changes, including clearing them", () => {
    expect(changedFields(complete, { ...complete, category: null, condition: "fair" })).toEqual({ category: null, condition: "fair" });
  });
});

describe("filledFields and hasUnsavedChanges", () => {
  it("creates drafts only with what was filled in", () => {
    expect(filledFields({ ...EMPTY_OFFER_FIELDS, title: " Lamp ", condition: "new" })).toEqual({ title: "Lamp", condition: "new" });
  });
  it("an empty new form has nothing unsaved; typing does", () => {
    expect(hasUnsavedChanges(null, EMPTY_OFFER_FIELDS)).toBe(false);
    expect(hasUnsavedChanges(null, { ...EMPTY_OFFER_FIELDS, title: "L" })).toBe(true);
    expect(hasUnsavedChanges(complete, complete)).toBe(false);
    expect(hasUnsavedChanges(complete, { ...complete, title: "Bike" })).toBe(true);
  });
});

describe("checkForm", () => {
  it("lets a draft save incomplete fields", () => {
    expect(checkForm("draft", "save", { ...EMPTY_OFFER_FIELDS, title: "L" }, 0)).toEqual({});
    expect(checkForm(null, "save", EMPTY_OFFER_FIELDS, 0)).toEqual({});
  });
  it("publishing needs every publish rule, photos included", () => {
    const errors = checkForm("draft", "publish", { ...complete, title: "Bike", wants_text: "", category: null }, 0);
    expect(errors).toMatchObject({
      title: PUBLISH_RULE_MESSAGES.title,
      wants_text: PUBLISH_RULE_MESSAGES.wants_text,
      category: PUBLISH_RULE_MESSAGES.category,
      photos: PUBLISH_RULE_MESSAGES.photos,
    });
  });
  it("saving an active or paused offer uses the publish rules", () => {
    expect(checkForm("active", "save", { ...complete, title: "" }, 1)).toHaveProperty("title");
    expect(checkForm("paused", "save", complete, 0)).toHaveProperty("photos");
    expect(checkForm("active", "save", complete, 1)).toEqual({});
  });
});

describe("firstInvalidField", () => {
  it("follows the order of the form", () => {
    expect(firstInvalidField({ wants_text: "x", title: "y" })).toBe("title");
    expect(firstInvalidField({ wants_text: "x", photos: "y" })).toBe("photos");
    expect(firstInvalidField({})).toBeNull();
  });
});

describe("formErrorsFrom", () => {
  it("keeps only fields the form shows", () => {
    expect(formErrorsFrom({ code: "VALIDATION_FAILED", message: "", fields: { title: "Too short", expected_revision: "Bad" } })).toEqual({ title: "Too short" });
  });
});

describe("conflictDifferences", () => {
  it("lists the latest saved values that differ from the form, with labels", () => {
    expect(conflictDifferences({ ...complete, title: "Mine" }, { ...complete, title: "Theirs", condition: "new" })).toEqual([
      { field: "title", label: "Title", latest: "Theirs" },
      { field: "condition", label: "Condition", latest: "New" },
    ]);
    expect(conflictDifferences(complete, { ...complete, category: null })[0]?.latest).toBe("(empty)");
  });
});

describe("errorMessage", () => {
  it("explains conflicts without revealing more than the status", () => {
    expect(errorMessage({ code: "CONFLICT", message: "", reason: "status_changed", current_status: null })).toBe("This offer isn't available any more.");
    expect(errorMessage({ code: "CONFLICT", message: "", reason: "status_changed", current_status: "paused" })).toMatch(/status changed/);
    expect(errorMessage({ code: "CONFLICT", message: "", reason: "stale_revision" })).toMatch(/another window or device/);
    expect(errorMessage({ code: "NETWORK", message: "Offline" })).toBe("Offline");
  });
});

describe("form steps", () => {
  it("every form field belongs to exactly one step, in form order", () => {
    const fields = FORM_STEPS.flatMap((step) => step.fields);
    expect(fields).toEqual([...FORM_FIELD_ORDER]);
  });
  it("finds a field's step and the errors that belong to a step", () => {
    expect(stepOf("photos")).toBe(0);
    expect(stepOf("condition")).toBe(1);
    expect(stepOf("wants_text")).toBe(2);
    expect(stepErrors({ title: "a", wants_text: "b" }, 1)).toEqual({ title: "a" });
    expect(stepErrors({ title: "a", wants_text: "b" }, 2)).toEqual({ wants_text: "b" });
  });
});

describe("switchOfferType (milestone 9)", () => {
  it("clears what a service can't have, and keeps the rest", () => {
    const item: OfferFields = { ...complete, handover_methods: ["collection", "on_site_service"] };
    expect(switchOfferType(item, "service")).toEqual({ ...complete, offer_type: "service", category: null, condition: null, handover_methods: ["on_site_service"] });
  });

  it("keeps a category that fits, and changes nothing when the type is the same", () => {
    const service: OfferFields = { ...complete, offer_type: "service", category: "repairs", condition: null, handover_methods: [] };
    expect(switchOfferType(service, "service")).toBe(service);
    expect(switchOfferType(service, "item").category).toBeNull();
  });
});
