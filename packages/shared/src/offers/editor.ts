import { API_ERROR_MESSAGES } from "./errors.ts";
import {
  OFFER_CATEGORIES,
  OFFER_CONDITIONS,
  OFFER_ITEM_CATEGORIES,
  OFFER_SERVICE_CATEGORIES,
  OFFER_TYPES,
  type OfferStatus,
} from "./constants.ts";
import { OFFER_EXCHANGE_MODES, OFFER_HANDOVER_METHODS, areaLabel } from "./location.ts";
import { checkOfferFields, fieldRulesFor, type FieldErrors, type OfferFields } from "./schemas.ts";
import type { ApiErrorBody, OwnerOffer } from "./views.ts";

// Pure rules for the offer form: which fields changed, which error to
// focus, how to describe a conflict. Kept out of the components so they
// can be unit tested.

/** Form order, so focus moves to the first invalid field on screen. */
export const FORM_FIELD_ORDER = [
  "offer_type",
  "photos",
  "title",
  "category",
  "condition",
  "description",
  "offering_text",
  "wants_text",
  "exchange_mode",
  "handover_methods",
  "area",
] as const;
export type FormField = (typeof FORM_FIELD_ORDER)[number];

/** On small screens the form is shown one step at a time (02-offer-creation.md, Design and UI states). */
export const FORM_STEPS = [
  { id: "photos", title: "Photos", fields: ["offer_type", "photos"] },
  { id: "details", title: "Details", fields: ["title", "category", "condition", "description"] },
  { id: "terms", title: "Exchange terms", fields: ["offering_text", "wants_text", "exchange_mode", "handover_methods", "area"] },
] as const satisfies readonly { id: string; title: string; fields: readonly FormField[] }[];

/** Index in FORM_STEPS of the step that shows this field. */
export const stepOf = (field: FormField): number => FORM_STEPS.findIndex((step) => (step.fields as readonly FormField[]).includes(field));

/** Only the errors for fields shown on one step. */
export function stepErrors(errors: Partial<Record<FormField, string>>, step: number): Partial<Record<FormField, string>> {
  const fields = FORM_STEPS[step]?.fields as readonly FormField[] | undefined;
  return Object.fromEntries(Object.entries(errors).filter(([field]) => fields?.includes(field as FormField)));
}

export const FIELD_LABELS: Record<keyof OfferFields, string> = {
  offer_type: "What you're offering",
  title: "Title",
  description: "Description",
  category: "Category",
  condition: "Condition",
  offering_text: "What you're offering",
  wants_text: "What you'd like in return",
  area: "Area",
  exchange_mode: "Where the exchange happens",
  handover_methods: "How the exchange happens",
};

const TEXT_FIELDS = ["title", "description", "offering_text", "wants_text"] as const;

/**
 * Milestone 9, V1–V3 and V6: switching between an item and a service
 * clears what doesn't fit the new type (its category, the condition
 * for a service, and handover methods the type can't use).
 */
export function switchOfferType(values: OfferFields, type: OfferFields["offer_type"]): OfferFields {
  if (values.offer_type === type) return values;
  const fits = (category: OfferFields["category"]) => category !== null && (category in OFFER_CATEGORIES_BY_TYPE[type]);
  return {
    ...values,
    offer_type: type,
    category: fits(values.category) ? values.category : null,
    condition: type === "service" ? null : values.condition,
    handover_methods: values.handover_methods.filter((m) => OFFER_HANDOVER_METHODS[m].service === (type === "service")),
  };
}

const OFFER_CATEGORIES_BY_TYPE = { item: OFFER_ITEM_CATEGORIES, service: OFFER_SERVICE_CATEGORIES } as const;

export function fieldsOf(offer: Pick<OwnerOffer, keyof OfferFields>): OfferFields {
  return {
    offer_type: offer.offer_type,
    title: offer.title,
    description: offer.description,
    category: offer.category,
    condition: offer.condition,
    offering_text: offer.offering_text,
    wants_text: offer.wants_text,
    area: offer.area,
    exchange_mode: offer.exchange_mode,
    handover_methods: [...offer.handover_methods],
  };
}

const sameMethods = (a: readonly string[], b: readonly string[]) => [...a].sort().join() === [...b].sort().join();

/** The fields whose value (trimmed, as the server stores it) differs from what is saved. */
export function changedFields(saved: OfferFields, current: OfferFields): Partial<OfferFields> {
  const patch: Partial<OfferFields> = {};
  if (current.offer_type !== saved.offer_type) patch.offer_type = current.offer_type;
  for (const field of TEXT_FIELDS) if (current[field].trim() !== saved[field].trim()) patch[field] = current[field].trim();
  if (current.category !== saved.category) patch.category = current.category;
  if (current.condition !== saved.condition) patch.condition = current.condition;
  if (current.area !== saved.area) patch.area = current.area;
  if (current.exchange_mode !== saved.exchange_mode) patch.exchange_mode = current.exchange_mode;
  if (!sameMethods(current.handover_methods, saved.handover_methods)) patch.handover_methods = [...current.handover_methods].sort() as OfferFields["handover_methods"];
  return patch;
}

/** Fields a new draft is created with: only what the member filled in. */
export function filledFields(current: OfferFields): Partial<OfferFields> {
  const fields: Partial<OfferFields> = {};
  if (current.offer_type !== "item") fields.offer_type = current.offer_type;
  for (const field of TEXT_FIELDS) if (current[field].trim()) fields[field] = current[field].trim();
  if (current.category) fields.category = current.category;
  if (current.condition) fields.condition = current.condition;
  if (current.area) fields.area = current.area;
  if (current.exchange_mode) fields.exchange_mode = current.exchange_mode;
  if (current.handover_methods.length > 0) fields.handover_methods = [...current.handover_methods].sort() as OfferFields["handover_methods"];
  return fields;
}

export function hasUnsavedChanges(saved: OfferFields | null, current: OfferFields): boolean {
  return saved ? Object.keys(changedFields(saved, current)).length > 0 : Object.keys(filledFields(current)).length > 0;
}

/**
 * Checks the form before saving or publishing, with the same shared
 * rules the API uses: draft rules for a draft being saved, publish
 * rules when publishing or editing an active or paused offer.
 */
export function checkForm(status: OfferStatus | null, intent: "save" | "publish", values: OfferFields, photoCount: number): FieldErrors {
  const rules = intent === "publish" ? "publish" : fieldRulesFor(status ?? "draft");
  const result = checkOfferFields(rules, values, photoCount);
  return result.ok ? {} : result.errors;
}

export function firstInvalidField(errors: Partial<Record<string, string>>): FormField | null {
  return FORM_FIELD_ORDER.find((field) => errors[field]) ?? null;
}

/** Field errors from an API response, keeping only fields the form shows. */
export function formErrorsFrom(error: ApiErrorBody): FieldErrors {
  const errors: FieldErrors = {};
  for (const [field, message] of Object.entries(error.fields ?? {})) {
    if ((FORM_FIELD_ORDER as readonly string[]).includes(field)) errors[field as FormField] = message;
  }
  return errors;
}

const displayValue = (field: keyof OfferFields, raw: OfferFields[keyof OfferFields]): string => {
  if (Array.isArray(raw)) {
    return raw.length === 0 ? "(empty)" : raw.map((m) => OFFER_HANDOVER_METHODS[m as keyof typeof OFFER_HANDOVER_METHODS]?.label ?? m).join(", ");
  }
  const value = raw as string | null;
  if (value === null || value === "") return "(empty)";
  if (field === "area") return areaLabel(value as Parameters<typeof areaLabel>[0]) ?? value;
  if (field === "exchange_mode") return OFFER_EXCHANGE_MODES[value as keyof typeof OFFER_EXCHANGE_MODES] ?? value;
  if (field === "category") return OFFER_CATEGORIES[value as keyof typeof OFFER_CATEGORIES] ?? value;
  if (field === "condition") return OFFER_CONDITIONS[value as keyof typeof OFFER_CONDITIONS] ?? value;
  if (field === "offer_type") return OFFER_TYPES[value as keyof typeof OFFER_TYPES] ?? value;
  return value;
};

/** After a stale-revision conflict: the saved values that differ from what the member typed. */
export function conflictDifferences(current: OfferFields, latest: OfferFields): { field: keyof OfferFields; label: string; latest: string }[] {
  return (Object.keys(changedFields(latest, current)) as (keyof OfferFields)[]).map((field) => ({
    field,
    label: FIELD_LABELS[field],
    latest: displayValue(field, latest[field]),
  }));
}

/** The sentence to show for an API error that is not a field error. */
export function errorMessage(error: ApiErrorBody): string {
  if (error.code === "CONFLICT" && error.reason === "status_changed") {
    return error.current_status === null
      ? "This offer isn't available any more."
      : "This offer's status changed in another window or device. The latest status is shown.";
  }
  if (error.code === "CONFLICT") return API_ERROR_MESSAGES.CONFLICT;
  return error.message;
}
