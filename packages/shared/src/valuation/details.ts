import {
  COMPLEXITY_LEVELS,
  FUNCTIONAL_STATUSES,
  GOODS_STATUSES,
  RECURRENCES,
  VALUATION_CONDITIONS,
  type ComponentKind,
} from "./constants.ts";

// The category-specific questions on the valuation form (owner,
// 2026-10-17). The form, the API schema and the database all read this
// one list: private.valuation_detail_fields holds the same rows, and
// supabase/tests/parity.db.test.ts keeps them identical.

export type DetailFieldType = "text" | "long_text" | "boolean" | "integer" | "kobo" | "date" | "enum";

export const DETAIL_ENUMS = {
  condition: VALUATION_CONDITIONS,
  goods_status: GOODS_STATUSES,
  functional_status: FUNCTIONAL_STATUSES,
  complexity: COMPLEXITY_LEVELS,
  recurrence: RECURRENCES,
} as const;
export type DetailEnum = keyof typeof DETAIL_ENUMS;

export interface DetailField {
  key: string;
  label: string;
  type: DetailFieldType;
  /** For type "enum": which list the value comes from. */
  options?: DetailEnum;
  /** Needed before the submission can be sent for review. */
  required?: boolean;
  /** Needed when this boolean field is true (defects when there are known defects). */
  requiredWhen?: string;
  /** Needed unless this other field is filled in (age unless a purchase date is given). */
  requiredUnless?: string;
  hint?: string;
}

/** Physical goods. */
export const GOODS_DETAIL_FIELDS: readonly DetailField[] = [
  { key: "product_name", label: "Product name", type: "text", required: true },
  { key: "brand", label: "Brand or manufacturer", type: "text" },
  { key: "model", label: "Model", type: "text" },
  { key: "model_number", label: "Model number", type: "text" },
  {
    key: "identifiers",
    label: "Serial number, IMEI or other identifier",
    type: "text",
    hint: "Seen only by you and BATR reviewers.",
  },
  { key: "purchase_date", label: "Purchase date", type: "date" },
  {
    key: "estimated_age_months",
    label: "Approximate age in months",
    type: "integer",
    requiredUnless: "purchase_date",
    hint: "Needed if you don't know the purchase date.",
  },
  { key: "goods_status", label: "New or used", type: "enum", options: "goods_status", required: true },
  { key: "condition", label: "Condition", type: "enum", options: "condition", required: true },
  { key: "condition_notes", label: "About the condition", type: "long_text" },
  { key: "functional_status", label: "Does it work?", type: "enum", options: "functional_status", required: true },
  { key: "test_results", label: "How you tested it", type: "long_text" },
  { key: "has_known_defects", label: "It has known defects or faults", type: "boolean", required: true },
  { key: "defects", label: "Describe the defects or faults", type: "long_text", requiredWhen: "has_known_defects" },
  { key: "missing_parts", label: "Missing parts", type: "long_text" },
  { key: "previous_repairs", label: "Previous repairs", type: "long_text" },
  { key: "accessories", label: "Accessories and packaging included", type: "long_text" },
  { key: "specifications", label: "Specifications", type: "long_text" },
  { key: "dimensions", label: "Size or dimensions", type: "text" },
  { key: "warranty", label: "Warranty", type: "text" },
  { key: "authenticity_notes", label: "Proof it is genuine", type: "long_text" },
  { key: "usage_history", label: "How it has been used", type: "long_text" },
  {
    key: "purchase_price_kobo",
    label: "Price you paid",
    type: "kobo",
    hint: "Optional. What you paid is one input; the assessed value can differ.",
  },
  { key: "user_comparables", label: "Similar items you have seen for sale", type: "long_text" },
];

/** Services and skills share one set of questions. */
export const SERVICE_DETAIL_FIELDS: readonly DetailField[] = [
  { key: "service_type", label: "Type of service or skill", type: "text", required: true },
  { key: "scope", label: "What is included", type: "long_text", required: true },
  { key: "deliverables", label: "What the other member will receive", type: "long_text", required: true },
  {
    key: "acceptance_criteria",
    label: "How both of you will know it is done",
    type: "long_text",
    required: true,
  },
  { key: "estimated_hours", label: "Estimated hours", type: "integer", required: true },
  { key: "complexity", label: "Complexity", type: "enum", options: "complexity", required: true },
  { key: "schedule", label: "When it can be done", type: "text" },
  { key: "recurrence", label: "How often", type: "enum", options: "recurrence" },
  { key: "sessions", label: "Number of sessions", type: "integer" },
  { key: "materials", label: "Materials or equipment included", type: "long_text" },
  { key: "travel", label: "Travel", type: "text" },
  { key: "extra_expenses_kobo", label: "Expected extra expenses", type: "kobo" },
  { key: "experience", label: "Your experience", type: "long_text", required: true },
  { key: "qualifications", label: "Qualifications or certificates", type: "long_text" },
  { key: "revisions_included", label: "Revisions included", type: "integer" },
  { key: "exclusions", label: "Not included", type: "long_text" },
  { key: "dependencies", label: "What you need from the other member", type: "long_text" },
  { key: "limitations", label: "Limitations", type: "long_text" },
  { key: "comparable_rates", label: "What others charge for similar work", type: "long_text" },
];

export function detailFieldsFor(kind: ComponentKind): readonly DetailField[] {
  return kind === "goods" ? GOODS_DETAIL_FIELDS : SERVICE_DETAIL_FIELDS;
}

export const DETAIL_LIMITS = { textMax: 200, longTextMax: 2000, integerMax: 100_000 } as const;
