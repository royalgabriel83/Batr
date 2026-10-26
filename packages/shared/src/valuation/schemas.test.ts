import { describe, expect, it } from "vitest";
import { GOODS_DETAIL_FIELDS, SERVICE_DETAIL_FIELDS } from "./details.ts";
import {
  AssessmentInputSchema,
  ComparisonInputSchema,
  ComponentSchema,
  SubmitValuationInputSchema,
  ValuationDraftSchema,
  cleanDetails,
  detailProblems,
  submitProblems,
  type ValuationComponent,
  type ValuationDraft,
} from "./schemas.ts";

const GOODS_ID = "11111111-1111-4111-8111-111111111111";
const SERVICE_ID = "22222222-2222-4222-8222-222222222222";

export const goods = (details: Record<string, string | number | boolean> = {}): ValuationComponent => ({
  id: GOODS_ID,
  kind: "goods",
  category: "electronics",
  subcategory: "Phones",
  description: "A Samsung phone with its charger.",
  quantity: 1,
  unit: "",
  proposed_value_kobo: 8_000_000,
  details: {
    product_name: "Galaxy A54",
    goods_status: "used",
    condition: "good",
    functional_status: "working",
    has_known_defects: false,
    estimated_age_months: 14,
    ...details,
  },
});

const service = (details: Record<string, string | number | boolean> = {}): ValuationComponent => ({
  id: SERVICE_ID,
  kind: "service",
  category: "home_repair",
  subcategory: "",
  description: "Repaint one bedroom, walls only.",
  quantity: 1,
  unit: "room",
  proposed_value_kobo: 4_000_000,
  details: {
    service_type: "Painting",
    scope: "Walls of one bedroom, two coats.",
    deliverables: "A painted room.",
    acceptance_criteria: "Even coverage, no drips, furniture protected.",
    estimated_hours: 8,
    complexity: "standard",
    experience: "Six years painting homes in Ibadan.",
    ...details,
  },
});

const photos = (id: string, count: number) => Array.from({ length: count }, () => ({ kind: "photo" as const, component_id: id }));

describe("component details", () => {
  it("defines unique keys in both lists", () => {
    for (const list of [GOODS_DETAIL_FIELDS, SERVICE_DETAIL_FIELDS]) {
      expect(new Set(list.map((f) => f.key)).size).toBe(list.length);
      for (const field of list) expect(field.type === "enum").toBe(field.options !== undefined);
    }
  });

  it("accepts a draft with unanswered questions", () => {
    expect(detailProblems("goods", {}, "draft")).toEqual({});
  });

  it("refuses unknown questions and invalid answers", () => {
    expect(detailProblems("goods", { colour_of_sky: "blue", condition: "mint", purchase_date: "2999-01-01", estimated_age_months: -1 }, "draft")).toEqual({
      colour_of_sky: "This question doesn't apply.",
      condition: "Choose from the list.",
      purchase_date: "The date can't be in the future.",
      estimated_age_months: "Enter a whole number.",
    });
    expect(detailProblems("service", { product_name: "x" }, "draft")).toHaveProperty("product_name");
  });

  it("needs the required answers before sending", () => {
    const problems = detailProblems("goods", {}, "submit");
    expect(Object.keys(problems).sort()).toEqual(
      ["product_name", "goods_status", "condition", "functional_status", "has_known_defects", "estimated_age_months"].sort(),
    );
  });

  it("needs the defects described when there are known defects", () => {
    expect(detailProblems("goods", goods({ has_known_defects: true }).details, "submit")).toEqual({ defects: "Answer this before sending." });
    expect(detailProblems("goods", goods({ has_known_defects: true, defects: "Cracked back glass." }).details, "submit")).toEqual({});
  });

  it("accepts a purchase date instead of an age", () => {
    const rest = { ...goods().details };
    delete rest.estimated_age_months;
    expect(detailProblems("goods", rest, "submit")).toHaveProperty("estimated_age_months");
    expect(detailProblems("goods", { ...rest, purchase_date: "2025-08-01" }, "submit")).toEqual({});
  });

  it("drops blank answers and trims text", () => {
    expect(cleanDetails({ brand: "  Samsung ", model: " ", warranty: null, has_known_defects: false })).toEqual({
      brand: "Samsung",
      has_known_defects: false,
    });
  });
});

describe("draft schema", () => {
  it("accepts goods, services and a mixed exchange", () => {
    const draft = { exchange_type: "cash_plus_barter", cash_component_kobo: 2_000_000, components: [goods(), service()] };
    expect(ValuationDraftSchema.safeParse(draft).success).toBe(true);
  });

  it("refuses a category from the wrong list", () => {
    expect(ComponentSchema.safeParse({ ...service(), category: "electronics" }).success).toBe(false);
    expect(ComponentSchema.safeParse({ ...goods(), category: "home_repair" }).success).toBe(false);
  });

  it("refuses fractional or negative kobo and duplicate items", () => {
    expect(ValuationDraftSchema.safeParse({ exchange_type: "pure_barter", cash_component_kobo: 1.5, components: [] }).success).toBe(false);
    expect(ComponentSchema.safeParse({ ...goods(), proposed_value_kobo: -1 }).success).toBe(false);
    expect(ValuationDraftSchema.safeParse({ exchange_type: "pure_barter", cash_component_kobo: 0, components: [goods(), goods()] }).success).toBe(false);
  });

  it("needs the accuracy declaration", () => {
    expect(SubmitValuationInputSchema.safeParse({ expected_revision: 1, declaration: false }).success).toBe(false);
    expect(SubmitValuationInputSchema.safeParse({ expected_revision: 1, declaration: true }).success).toBe(true);
  });
});

describe("submit rules", () => {
  const draft = (patch: Partial<ValuationDraft>): ValuationDraft => ({ exchange_type: "pure_barter", cash_component_kobo: 0, components: [goods()], ...patch });

  it("passes a complete pure barter with two photos", () => {
    expect(submitProblems(draft({}), photos(GOODS_ID, 2))).toEqual({});
  });

  it("needs at least two photos of each goods item", () => {
    expect(submitProblems(draft({}), photos(GOODS_ID, 1))).toHaveProperty(`${GOODS_ID}.photos`);
    expect(submitProblems(draft({}), [...photos(GOODS_ID, 1), { kind: "receipt", component_id: GOODS_ID }])).toHaveProperty(`${GOODS_ID}.photos`);
    expect(submitProblems(draft({}), photos(SERVICE_ID, 2))).toHaveProperty(`${GOODS_ID}.photos`);
  });

  it("does not need photos for services or skills", () => {
    expect(submitProblems(draft({ components: [service()] }), [])).toEqual({});
  });

  it("applies the exchange type rules", () => {
    expect(submitProblems(draft({ cash_component_kobo: 100 }), photos(GOODS_ID, 2))).toHaveProperty("cash_component_kobo");
    expect(submitProblems(draft({ exchange_type: "cash_plus_barter" }), photos(GOODS_ID, 2))).toHaveProperty("cash_component_kobo");
    expect(submitProblems(draft({ components: [] }), [])).toHaveProperty("components");
    expect(submitProblems(draft({ exchange_type: "cash_only", cash_component_kobo: 100 }), [])).toHaveProperty("components");
    expect(submitProblems(draft({ exchange_type: "cash_only", cash_component_kobo: 100, components: [] }), [])).toEqual({});
  });

  it("reports each missing component field by its id", () => {
    const problems = submitProblems(
      draft({ components: [{ ...service({ scope: "" }), category: null, description: "short", proposed_value_kobo: null }] }),
      [],
    );
    expect(Object.keys(problems).sort()).toEqual(
      [`${SERVICE_ID}.category`, `${SERVICE_ID}.description`, `${SERVICE_ID}.proposed_value_kobo`, `${SERVICE_ID}.scope`].sort(),
    );
  });
});

describe("reviewer inputs", () => {
  it("accepts a comparison with adjustments", () => {
    const parsed = ComparisonInputSchema.safeParse({
      component_id: GOODS_ID,
      source: "Jiji listing",
      url: "https://jiji.ng/example",
      observed_on: "2026-10-10",
      price_kind: "asking",
      price_kobo: 9_000_000,
      condition: "Used, good",
      characteristics: "Same model, 128 GB",
      adjustments: [{ factor: "condition", percent_bp: -1000, note: "Ours has scratches" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("refuses a non-web link and an adjustment beyond 90%", () => {
    const base = { component_id: null, source: "Shop", observed_on: "2026-10-10", price_kind: "sold", price_kobo: 1, condition: "", characteristics: "", adjustments: [] };
    expect(ComparisonInputSchema.safeParse({ ...base, url: "javascript:alert(1)" }).success).toBe(false);
    expect(ComparisonInputSchema.safeParse({ ...base, url: "", adjustments: [{ factor: "age", percent_bp: -9500, note: "" }] }).success).toBe(false);
  });

  it("needs a rationale for every decision", () => {
    const decision = { expected_revision: 2, outcome: "approved", components: [], rationale: "ok", confidence: "high", limitations: "", message: "" };
    expect(AssessmentInputSchema.safeParse(decision).success).toBe(false);
  });
});
