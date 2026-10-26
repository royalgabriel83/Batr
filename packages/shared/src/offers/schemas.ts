import { z } from "zod";
import { OFFER_CATEGORY_IDS, OFFER_CONDITION_IDS, OFFER_LIMITS, OFFER_STATUSES, OFFER_TYPE_IDS, type OfferStatus } from "./constants.ts";
import { PhotoIdSchema } from "./ids.ts";
import {
  OFFER_AREA_IDS,
  OFFER_EXCHANGE_MODE_IDS,
  OFFER_HANDOVER_METHOD_IDS,
  OFFER_TYPE_MESSAGES,
  logisticsProblem,
  offerTypeProblems,
  normaliseHandoverMethods,
} from "./location.ts";

// Field rules from specs/milestone-1.md (Validation). Browser and
// server share these schemas; the server and database are
// authoritative. Text fields are trimmed, so whitespace alone counts
// as empty.

const { titleMax, titleMinToPublish, descriptionMax, shortTextMax, shortTextMinToPublish, altTextMax } = OFFER_LIMITS;

const text = (max: number, name: string) =>
  z.string().trim().max(max, `${name} must be ${String(max)} characters or fewer.`);

const offerType = z.enum(OFFER_TYPE_IDS, { error: "Choose an item or a service." });
const category = z.enum(OFFER_CATEGORY_IDS, { error: "Choose a category." });
const condition = z.enum(OFFER_CONDITION_IDS, { error: "Choose a condition." });
// (These two messages equal PUBLISH_RULE_MESSAGES.category and .condition.)

// Location and logistics (phase 1): optional under both rule sets.
const area = z.enum(OFFER_AREA_IDS, { error: "Choose an area from the list." }).nullable();
const exchangeMode = z.enum(OFFER_EXCHANGE_MODE_IDS, { error: "Choose how the exchange happens." }).nullable();
const handoverMethods = z
  .array(z.enum(OFFER_HANDOVER_METHOD_IDS, { error: "Choose from the listed options." }))
  .transform(normaliseHandoverMethods);

/** Every editable offer field, with the rules that apply to a draft. */
export const OfferFieldsSchema = z.strictObject({
  /** Milestone 9, V1. */
  offer_type: offerType,
  title: text(titleMax, "Title"),
  description: text(descriptionMax, "Description"),
  category: category.nullable(),
  condition: condition.nullable(),
  offering_text: text(shortTextMax, "What you're offering"),
  wants_text: text(shortTextMax, "What you'd like"),
  area,
  exchange_mode: exchangeMode,
  handover_methods: handoverMethods,
});
export type OfferFields = z.infer<typeof OfferFieldsSchema>;

export const EMPTY_OFFER_FIELDS: OfferFields = {
  offer_type: "item",
  title: "",
  description: "",
  category: null,
  condition: null,
  offering_text: "",
  wants_text: "",
  area: null,
  exchange_mode: null,
  handover_methods: [],
};

/**
 * The message for each publish rule, by the field name the database
 * reports (private.publish_rule_failures) and the schemas below use.
 */
export const PUBLISH_RULE_MESSAGES = {
  title: `Enter a title of at least ${String(titleMinToPublish)} characters.`,
  category: "Choose a category.",
  condition: "Choose a condition.",
  offering_text: `Describe what you're offering in at least ${String(shortTextMinToPublish)} characters.`,
  wants_text: `Say what you'd like in return in at least ${String(shortTextMinToPublish)} characters.`,
  photos: "Add at least one photo.",
} as const;

/**
 * Rules for publishing, and for any edit while active or paused. A
 * condition is needed for an item only (V3); checkOfferFields adds it.
 */
export const PublishFieldsSchema = z.strictObject({
  offer_type: offerType,
  title: text(titleMax, "Title").min(titleMinToPublish, PUBLISH_RULE_MESSAGES.title),
  description: text(descriptionMax, "Description"),
  category,
  condition: condition.nullable(),
  offering_text: text(shortTextMax, "What you're offering").min(shortTextMinToPublish, PUBLISH_RULE_MESSAGES.offering_text),
  wants_text: text(shortTextMax, "What you'd like").min(shortTextMinToPublish, PUBLISH_RULE_MESSAGES.wants_text),
  area,
  exchange_mode: exchangeMode,
  handover_methods: handoverMethods,
});

export const PhotoAltTextSchema = text(altTextMax, "Photo description");

export type FieldErrors = Partial<Record<keyof OfferFields | "photos", string>>;
export type FieldCheck = { ok: true; fields: OfferFields } | { ok: false; errors: FieldErrors };

/** Which rule set applies to an offer's fields in a given status. */
export function fieldRulesFor(status: OfferStatus): "draft" | "publish" {
  return status === "draft" ? "draft" : "publish";
}

/**
 * Checks an offer's fields and photo count against the draft or publish
 * rules. Returns the trimmed fields, or one message per failing field.
 */
export function checkOfferFields(rules: "draft" | "publish", fields: OfferFields, photoCount: number): FieldCheck {
  const errors: FieldErrors = {};
  const parsed = (rules === "draft" ? OfferFieldsSchema : PublishFieldsSchema).safeParse(fields);
  if (!parsed.success) Object.assign(errors, fieldErrors(parsed.error));
  else {
    const { offer_type: type, category: chosen, condition: state, handover_methods: methods } = parsed.data;
    const problem = logisticsProblem(parsed.data.exchange_mode, methods);
    if (problem) errors.handover_methods = problem;
    // A logistics message, when there is one, says more than the type rule.
    for (const [field, reason] of Object.entries(offerTypeProblems(type, chosen, state, methods))) {
      errors[field as keyof FieldErrors] ??= OFFER_TYPE_MESSAGES[reason];
    }
  }
  if (rules === "publish" && fields.offer_type !== "service" && !fields.condition) errors.condition ??= PUBLISH_RULE_MESSAGES.condition;
  const minPhotos = rules === "draft" ? 0 : OFFER_LIMITS.photosMinToPublish;
  if (photoCount < minPhotos) errors.photos = PUBLISH_RULE_MESSAGES.photos;
  if (photoCount > OFFER_LIMITS.photosMax) {
    errors.photos = `An offer can have at most ${String(OFFER_LIMITS.photosMax)} photos.`;
  }
  return parsed.success && Object.keys(errors).length === 0 ? { ok: true, fields: parsed.data } : { ok: false, errors };
}

/** Any shared schema producing `T`, for code outside this package. */
export type Schema<T> = z.ZodType<T>;

/** Parses input with a shared schema: the data, or one message per field. */
export function checkInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; errors: Record<string, string> } {
  const parsed = schema.safeParse(input);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, errors: fieldErrors(parsed.error) };
}

/** First message for each top-level field in a Zod error. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys" && issue.path.length === 0) {
      for (const key of issue.keys) result[key] ??= "This field isn't accepted.";
      continue;
    }
    const key = String(issue.path[0] ?? "_");
    result[key] ??= issue.message;
  }
  return result;
}

// Request bodies (specs/milestone-1.md, API). Every mutation on an
// existing offer carries the revision and status the client last saw.

const ExpectationsSchema = z.strictObject({
  expected_revision: z.int().min(1),
  expected_status: z.enum(OFFER_STATUSES),
});

export const CreateOfferInputSchema = OfferFieldsSchema.partial();
export type CreateOfferInput = z.infer<typeof CreateOfferInputSchema>;

export const EditOfferInputSchema = ExpectationsSchema.extend({
  fields: OfferFieldsSchema.partial().refine((patch) => Object.keys(patch).length > 0, "Change at least one field."),
});
export type EditOfferInput = z.infer<typeof EditOfferInputSchema>;

/** Publish, pause, resume, close, draft delete and photo removal. */
export const OfferActionInputSchema = ExpectationsSchema;
export type OfferActionInput = z.infer<typeof OfferActionInputSchema>;

export const PhotoAltTextInputSchema = ExpectationsSchema.extend({ alt_text: PhotoAltTextSchema });
export type PhotoAltTextInput = z.infer<typeof PhotoAltTextInputSchema>;

/** The text fields sent with a photo upload (multipart form), before parsing numbers. */
export const PhotoUploadFieldsSchema = z.strictObject({
  expected_revision: z.coerce.number().int().min(1),
  expected_status: z.enum(OFFER_STATUSES),
  alt_text: PhotoAltTextSchema.default(""),
});
export type PhotoUploadFields = z.infer<typeof PhotoUploadFieldsSchema>;

export const ReorderPhotosInputSchema = ExpectationsSchema.extend({
  photo_ids: z
    .array(PhotoIdSchema)
    .min(1)
    .max(OFFER_LIMITS.photosMax)
    .refine((ids) => new Set(ids).size === ids.length, "Each photo can appear only once."),
});
export type ReorderPhotosInput = z.infer<typeof ReorderPhotosInputSchema>;
