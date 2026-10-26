import type { OfferFields } from "./schemas.ts";

// Field classification from specs/milestone-1.md (Offer fields: three
// groups). Every editable field must appear here; `satisfies` makes a
// missing field a type error and field-groups.test.ts checks it too.

export type FieldGroup = "material" | "preference" | "discovery";

/** Offer columns plus the photo changes that count as edits. */
export type EditableOfferField = keyof OfferFields | "photo_set" | "photo_order" | "photo_alt_text";

export const OFFER_FIELD_GROUPS = {
  /** Milestone 9, V7: switching between an item and a service. */
  offer_type: "material",
  title: "material",
  description: "material",
  condition: "material",
  offering_text: "material",
  /** A photo added or removed. */
  photo_set: "material",
  wants_text: "preference",
  area: "preference",
  exchange_mode: "preference",
  handover_methods: "preference",
  category: "discovery",
  /** Which photo is the cover, and the order of the rest. */
  photo_order: "discovery",
  photo_alt_text: "discovery",
} as const satisfies Record<EditableOfferField, FieldGroup>;

export const EDITABLE_OFFER_FIELDS = Object.keys(OFFER_FIELD_GROUPS) as EditableOfferField[];

/** The fields in `patch` whose value differs from `before`. */
export function changedOfferFields(before: OfferFields, patch: Partial<OfferFields>): (keyof OfferFields)[] {
  return (Object.keys(patch) as (keyof OfferFields)[]).filter(
    (field) => patch[field] !== undefined && JSON.stringify(patch[field]) !== JSON.stringify(before[field]),
  );
}

export function isMaterialChange(fields: readonly EditableOfferField[]): boolean {
  return fields.some((field) => OFFER_FIELD_GROUPS[field] === "material");
}

/**
 * `content_version` after one edit request: one higher if any material
 * field changed, however many did; unchanged otherwise. (`revision`
 * rises on every write and is handled by the database.)
 */
export function contentVersionAfter(current: number, fields: readonly EditableOfferField[]): number {
  return isMaterialChange(fields) ? current + 1 : current;
}
