import { z } from "zod";
import {
  ADJUSTMENT_FACTORS,
  APPEAL_OUTCOMES,
  ASSESSMENT_OUTCOMES,
  COMPARISON_PRICE_KINDS,
  COMPONENT_KIND_IDS,
  CONFIDENCE_LEVELS,
  EVIDENCE_KINDS,
  EVIDENCE_LIMITS,
  VALUATION_LIMITS,
  categoriesFor,
  type ComponentKind,
} from "./constants.ts";
import { DETAIL_ENUMS, DETAIL_LIMITS, detailFieldsFor, type DetailField } from "./details.ts";
import { EXCHANGE_TYPE_IDS, type ExchangeType } from "./fees.ts";

// Valuation request bodies and the submit rules (owner, 2026-10-17).
// The API checks these first; the database functions apply the same
// rules again and are authoritative (private.valuation_problems).

const enumKeys = <T extends Record<string, string>>(record: T) => Object.keys(record) as [keyof T & string, ...(keyof T & string)[]];

/** A whole number of kobo. */
export const KoboSchema = z.int("Enter a whole amount.").min(0, "The amount can't be negative.").max(VALUATION_LIMITS.koboMax, "The amount is too large.");

export type DetailValue = string | number | boolean;
export type Details = Record<string, DetailValue>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Why one detail value is not acceptable, or null. Empty strings mean "not answered". */
export function detailValueProblem(field: DetailField, value: unknown, today = new Date().toISOString().slice(0, 10)): string | null {
  switch (field.type) {
    case "text":
    case "long_text": {
      if (typeof value !== "string") return "Enter text.";
      const max = field.type === "text" ? DETAIL_LIMITS.textMax : DETAIL_LIMITS.longTextMax;
      return value.trim().length > max ? `Use ${String(max)} characters or fewer.` : null;
    }
    case "boolean":
      return typeof value === "boolean" ? null : "Choose yes or no.";
    case "integer":
      return Number.isInteger(value) && (value as number) >= 0 && (value as number) <= DETAIL_LIMITS.integerMax ? null : "Enter a whole number.";
    case "kobo":
      return KoboSchema.safeParse(value).success ? null : "Enter a valid amount.";
    case "date":
      if (typeof value !== "string" || !DATE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) return "Enter a valid date.";
      return value > today ? "The date can't be in the future." : null;
    case "enum":
      return typeof value === "string" && field.options && value in DETAIL_ENUMS[field.options] ? null : "Choose from the list.";
  }
}

const filled = (value: unknown) => value !== undefined && value !== null && !(typeof value === "string" && value.trim() === "");

/**
 * Problems with a component's details, by field key. Draft rules check
 * only that answered values are valid; submit rules also need the
 * required answers.
 */
export function detailProblems(kind: ComponentKind, details: Record<string, unknown>, rules: "draft" | "submit"): Record<string, string> {
  const fields = detailFieldsFor(kind);
  const known = new Map(fields.map((field) => [field.key, field]));
  const problems: Record<string, string> = {};
  for (const [key, value] of Object.entries(details)) {
    const field = known.get(key);
    if (!field) problems[key] = "This question doesn't apply.";
    else if (filled(value)) {
      const problem = detailValueProblem(field, typeof value === "string" ? value.trim() : value);
      if (problem) problems[key] = problem;
    }
  }
  if (rules === "submit") {
    for (const field of fields) {
      if (problems[field.key] || filled(details[field.key])) continue;
      const needed =
        field.required === true ||
        (field.requiredWhen !== undefined && details[field.requiredWhen] === true) ||
        (field.requiredUnless !== undefined && !filled(details[field.requiredUnless]));
      if (needed) problems[field.key] = "Answer this before sending.";
    }
  }
  return problems;
}

/** Drops unanswered values and trims text, as the database stores them. */
export function cleanDetails(details: Record<string, unknown>): Details {
  const result: Details = {};
  for (const [key, value] of Object.entries(details)) {
    if (!filled(value)) continue;
    result[key] = typeof value === "string" ? value.trim() : (value as DetailValue);
  }
  return result;
}

const text = (max: number, name: string) => z.string().trim().max(max, `${name} must be ${String(max)} characters or fewer.`);

export const ComponentSchema = z
  .strictObject({
    id: z.uuid(),
    kind: z.enum(COMPONENT_KIND_IDS, { error: "Choose goods, a service or a skill." }),
    category: z.string().nullable(),
    subcategory: text(80, "Subcategory"),
    description: text(DETAIL_LIMITS.longTextMax, "Description"),
    quantity: z.int().min(1, "Enter at least 1.").max(10_000, "Enter 10,000 or fewer."),
    unit: text(40, "Unit"),
    proposed_value_kobo: KoboSchema.nullable(),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  })
  .superRefine((component, context) => {
    if (component.category !== null && !(component.category in categoriesFor(component.kind))) {
      context.addIssue({ code: "custom", path: ["category"], message: "Choose a category from the list." });
    }
    for (const [key, message] of Object.entries(detailProblems(component.kind, component.details, "draft"))) {
      context.addIssue({ code: "custom", path: ["details", key], message });
    }
  });
export type ValuationComponent = z.infer<typeof ComponentSchema>;

/** The whole editable draft, saved at once. */
export const ValuationDraftSchema = z.strictObject({
  exchange_type: z.enum(EXCHANGE_TYPE_IDS, { error: "Choose the type of exchange." }),
  cash_component_kobo: KoboSchema,
  components: z
    .array(ComponentSchema)
    .max(VALUATION_LIMITS.componentsMax, `Add at most ${String(VALUATION_LIMITS.componentsMax)} items.`)
    .refine((list) => new Set(list.map((c) => c.id)).size === list.length, "Each item can appear only once."),
});
export type ValuationDraft = z.infer<typeof ValuationDraftSchema>;

export const SaveValuationInputSchema = z.strictObject({
  expected_revision: z.int().min(1),
  draft: ValuationDraftSchema,
});

export const SubmitValuationInputSchema = z.strictObject({
  expected_revision: z.int().min(1),
  declaration: z.literal(true, { error: "Confirm that the information is accurate." }),
  note: text(DETAIL_LIMITS.longTextMax, "Note").default(""),
});

export const WithdrawValuationInputSchema = z.strictObject({ expected_revision: z.int().min(1) });

export const AppealInputSchema = z.strictObject({
  expected_revision: z.int().min(1),
  reason: text(DETAIL_LIMITS.longTextMax, "Reason").min(20, "Explain why in at least 20 characters."),
});

export interface EvidenceSummary {
  kind: keyof typeof EVIDENCE_KINDS;
  component_id: string | null;
}

/**
 * Everything that stops a draft being sent for review, keyed by field
 * (`exchange_type`, `cash_component_kobo`, `components`, `declaration`,
 * or `{componentId}.{field}`). The same keys come back from the
 * database.
 */
export function submitProblems(draft: ValuationDraft, evidence: readonly EvidenceSummary[]): Record<string, string> {
  const problems: Record<string, string> = {};
  const type: ExchangeType = draft.exchange_type;
  const cash = draft.cash_component_kobo;
  if (type === "cash_only") {
    if (draft.components.length > 0) problems.components = "A cash-only exchange has no goods, services or skills to value.";
    if (cash === 0) problems.cash_component_kobo = "Enter the agreed cash amount.";
    return problems;
  }
  if (draft.components.length === 0) problems.components = "Add at least one item, service or skill.";
  if (type === "pure_barter" && cash !== 0) problems.cash_component_kobo = "A pure barter has no cash. Choose barter plus cash instead.";
  if (type === "cash_plus_barter" && cash === 0) problems.cash_component_kobo = "Enter the cash amount.";
  for (const component of draft.components) {
    const at = (field: string) => `${component.id}.${field}`;
    if (component.category === null) problems[at("category")] = "Choose a category.";
    if (component.description.trim().length < VALUATION_LIMITS.descriptionMinToSubmit) {
      problems[at("description")] = `Describe it in at least ${String(VALUATION_LIMITS.descriptionMinToSubmit)} characters.`;
    }
    if (component.proposed_value_kobo === null || component.proposed_value_kobo === 0) {
      problems[at("proposed_value_kobo")] = "Enter the value you propose.";
    }
    for (const [key, message] of Object.entries(detailProblems(component.kind, component.details, "submit"))) {
      problems[at(key)] = message;
    }
    if (component.kind === "goods") {
      const photos = evidence.filter((item) => item.kind === "photo" && item.component_id === component.id).length;
      if (photos < EVIDENCE_LIMITS.minPhotosPerGoods) {
        problems[at("photos")] = `Add at least ${String(EVIDENCE_LIMITS.minPhotosPerGoods)} photos of the actual item from different angles.`;
      }
    }
  }
  return problems;
}

// Reviewer inputs.

export const AdjustmentSchema = z.strictObject({
  factor: z.enum(enumKeys(ADJUSTMENT_FACTORS)),
  /** −90% to +90%, in basis points. */
  percent_bp: z.int().min(-9000).max(9000),
  note: text(200, "Note"),
});
export type Adjustment = z.infer<typeof AdjustmentSchema>;

export const ComparisonInputSchema = z.strictObject({
  component_id: z.uuid().nullable(),
  source: text(200, "Source").min(2, "Name the source."),
  url: z.union([z.url({ protocol: /^https?$/, error: "Enter a web address starting with http or https." }), z.literal("")]),
  observed_on: z.iso.date("Enter the date you saw it."),
  price_kind: z.enum(enumKeys(COMPARISON_PRICE_KINDS)),
  price_kobo: KoboSchema.refine((value) => value > 0, "Enter the price."),
  condition: text(200, "Condition"),
  characteristics: text(DETAIL_LIMITS.longTextMax, "Characteristics"),
  adjustments: z.array(AdjustmentSchema).max(10),
});
export type ComparisonInput = z.infer<typeof ComparisonInputSchema>;

export const AssessmentInputSchema = z.strictObject({
  expected_revision: z.int().min(1),
  outcome: z.enum(enumKeys(ASSESSMENT_OUTCOMES)),
  components: z.array(z.strictObject({ component_id: z.uuid(), value_kobo: KoboSchema })).max(VALUATION_LIMITS.componentsMax),
  rationale: text(DETAIL_LIMITS.longTextMax, "Rationale").min(20, "Explain the decision in at least 20 characters."),
  confidence: z.enum(enumKeys(CONFIDENCE_LEVELS)),
  limitations: text(DETAIL_LIMITS.longTextMax, "Limitations"),
  message: text(DETAIL_LIMITS.longTextMax, "Message to the member"),
});
export type AssessmentInput = z.infer<typeof AssessmentInputSchema>;

export const AppealDecisionInputSchema = AssessmentInputSchema.omit({ outcome: true }).extend({
  outcome: z.enum(enumKeys(APPEAL_OUTCOMES)),
});
export type AppealDecisionInput = z.infer<typeof AppealDecisionInputSchema>;

/** The text fields sent with an evidence upload (multipart form). */
export const EvidenceFieldsSchema = z.strictObject({
  kind: z.enum(enumKeys(EVIDENCE_KINDS), { error: "Choose what this file shows." }),
  component_id: z.union([z.uuid(), z.literal("")]).default(""),
});

/** POST /api/v1/review/valuations/:id */
export const ReviewActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("add_comparison"), comparison: ComparisonInputSchema }),
  z.strictObject({
    action: z.literal("exclude_comparison"),
    comparison_id: z.uuid(),
    excluded: z.boolean(),
    reason: text(500, "Reason").default(""),
  }),
  z.strictObject({ action: z.literal("add_note"), body: text(DETAIL_LIMITS.longTextMax, "Note").min(1, "Write a note.") }),
  z.strictObject({ action: z.literal("decide"), decision: AssessmentInputSchema }),
]);
export type ReviewAction = z.infer<typeof ReviewActionSchema>;

/** POST /api/v1/review/inspections/:id */
export const InspectionActionSchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("schedule"),
    scheduled_for: z.iso.datetime({ offset: true, error: "Choose a date and time." }),
    arrangements: text(500, "Arrangements").default(""),
  }),
  z.strictObject({
    action: z.literal("complete"),
    findings: text(DETAIL_LIMITS.longTextMax, "Findings").min(20, "Record the findings in at least 20 characters."),
    condition_confirmed: z.union([z.enum(enumKeys(DETAIL_ENUMS.condition)), z.literal("")]).default(""),
  }),
  z.strictObject({ action: z.literal("cancel"), reason: text(500, "Reason").min(5, "Give a reason.") }),
]);

/** POST /api/v1/review/appeals/:id */
export const AppealActionSchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("claim") }),
  z.strictObject({ action: z.literal("decide"), decision: AppealDecisionInputSchema }),
]);
