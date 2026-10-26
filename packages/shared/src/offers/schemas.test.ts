import { describe, expect, it } from "vitest";
import { OFFER_LIMITS } from "./constants.ts";
import {
  CreateOfferInputSchema,
  EMPTY_OFFER_FIELDS,
  EditOfferInputSchema,
  OfferActionInputSchema,
  PhotoAltTextInputSchema,
  PhotoAltTextSchema,
  PhotoUploadFieldsSchema,
  ReorderPhotosInputSchema,
  checkInput,
  checkOfferFields,
  fieldRulesFor,
  type OfferFields,
} from "./schemas.ts";

const publishable: OfferFields = {
  offer_type: "item",
  title: "Road bike",
  description: "Steel frame, 56 cm.",
  category: "sports_outdoors",
  condition: "good",
  offering_text: "A road bike",
  wants_text: "A camping tent",
  area: null,
  exchange_mode: null,
  handover_methods: [],
};
const photo1 = "3f1d2c4b-5a6e-4f70-8b91-a2b3c4d5e6f7";
const photo2 = "4a2e3d5c-6b7f-4081-9ca2-b3c4d5e6f708";

describe("draft rules", () => {
  it("accept an empty draft with no photos", () => {
    expect(checkOfferFields("draft", EMPTY_OFFER_FIELDS, 0)).toEqual({ ok: true, fields: EMPTY_OFFER_FIELDS });
  });

  it("enforce maximum lengths and the photo limit", () => {
    const result = checkOfferFields(
      "draft",
      { ...EMPTY_OFFER_FIELDS, title: "x".repeat(81), description: "x".repeat(2001), wants_text: "x".repeat(201) },
      9,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        title: "Title must be 80 characters or fewer.",
        description: "Description must be 2000 characters or fewer.",
        wants_text: "What you'd like must be 200 characters or fewer.",
        photos: "An offer can have at most 8 photos.",
      },
    });
  });

  it("reject a category or condition that is not in the list", () => {
    const result = checkOfferFields("draft", { ...EMPTY_OFFER_FIELDS, category: "cars" as never, condition: "mint" as never }, 0);
    expect(result).toEqual({ ok: false, errors: { category: "Choose a category.", condition: "Choose a condition." } });
  });
});

describe("publish rules", () => {
  it("accept a complete offer with 1 to 8 photos, trimmed", () => {
    expect(checkOfferFields("publish", { ...publishable, title: "  Road bike  " }, 1)).toEqual({ ok: true, fields: publishable });
    expect(checkOfferFields("publish", publishable, OFFER_LIMITS.photosMax).ok).toBe(true);
  });

  it("refuse each missing publish field and no photo (acceptance criterion 6)", () => {
    const result = checkOfferFields(
      "publish",
      { ...publishable, title: "Bike", category: null, condition: null, offering_text: "", wants_text: "   " },
      0,
    );
    expect(result).toEqual({
      ok: false,
      errors: {
        title: "Enter a title of at least 5 characters.",
        category: "Choose a category.",
        condition: "Choose a condition.",
        offering_text: "Describe what you're offering in at least 3 characters.",
        wants_text: "Say what you'd like in return in at least 3 characters.",
        photos: "Add at least one photo.",
      },
    });
  });

  it("refuse more than 8 photos even when every field is valid", () => {
    expect(checkOfferFields("publish", publishable, 9)).toEqual({
      ok: false,
      errors: { photos: "An offer can have at most 8 photos." },
    });
  });

  it("apply to active and paused offers; draft rules apply to drafts", () => {
    expect(fieldRulesFor("draft")).toBe("draft");
    expect(fieldRulesFor("active")).toBe("publish");
    expect(fieldRulesFor("paused")).toBe("publish");
    expect(fieldRulesFor("closed")).toBe("publish");
  });
});

describe("request bodies", () => {
  it("create accepts any subset of fields and rejects unknown keys", () => {
    expect(CreateOfferInputSchema.safeParse({ title: "Lamp" }).success).toBe(true);
    expect(CreateOfferInputSchema.safeParse({ title: "Lamp", status: "active" }).success).toBe(false);
  });

  it("edit requires the expected revision and status and at least one field", () => {
    const base = { expected_revision: 2, expected_status: "active" };
    expect(EditOfferInputSchema.safeParse({ ...base, fields: { wants_text: "A kettle" } }).success).toBe(true);
    expect(EditOfferInputSchema.safeParse({ ...base, fields: {} }).success).toBe(false);
    expect(EditOfferInputSchema.safeParse({ fields: { title: "Lamp" } }).success).toBe(false);
    expect(EditOfferInputSchema.safeParse({ ...base, expected_revision: 0, fields: { title: "Lamp" } }).success).toBe(false);
    expect(EditOfferInputSchema.safeParse({ ...base, fields: { owner_id: "x" } }).success).toBe(false);
  });

  it("transitions require the expected revision and a known status", () => {
    expect(OfferActionInputSchema.safeParse({ expected_revision: 1, expected_status: "draft" }).success).toBe(true);
    expect(OfferActionInputSchema.safeParse({ expected_revision: 1.5, expected_status: "draft" }).success).toBe(false);
    expect(OfferActionInputSchema.safeParse({ expected_revision: 1, expected_status: "deleted" }).success).toBe(false);
  });

  it("reorder needs a list of distinct photo ids, at most 8", () => {
    const base = { expected_revision: 1, expected_status: "draft" };
    expect(ReorderPhotosInputSchema.safeParse({ ...base, photo_ids: [photo2, photo1] }).success).toBe(true);
    expect(ReorderPhotosInputSchema.safeParse({ ...base, photo_ids: [photo1, photo1] }).success).toBe(false);
    expect(ReorderPhotosInputSchema.safeParse({ ...base, photo_ids: [] }).success).toBe(false);
    expect(ReorderPhotosInputSchema.safeParse({ ...base, photo_ids: ["not-a-uuid"] }).success).toBe(false);
    expect(ReorderPhotosInputSchema.safeParse({ ...base, photo_ids: Array(9).fill(photo1) }).success).toBe(false);
  });

  it("photo alt text is optional and at most 200 characters", () => {
    expect(PhotoAltTextSchema.safeParse("").success).toBe(true);
    expect(PhotoAltTextSchema.safeParse("x".repeat(201)).success).toBe(false);
  });
});

describe("checkInput and upload fields", () => {
  it("names each unknown field instead of reporting the whole body", () => {
    expect(checkInput(CreateOfferInputSchema, { title: "Bike", owner_id: "x", status: "active" })).toEqual({
      ok: false,
      errors: { owner_id: "This field isn't accepted.", status: "This field isn't accepted." },
    });
    expect(checkInput(CreateOfferInputSchema, { title: " Bike " })).toEqual({ ok: true, data: { title: "Bike" } });
  });

  it("reads upload form fields (strings) into numbers and trims alt text", () => {
    expect(PhotoUploadFieldsSchema.parse({ expected_revision: "3", expected_status: "draft", alt_text: " Front " })).toEqual({
      expected_revision: 3,
      expected_status: "draft",
      alt_text: "Front",
    });
    expect(PhotoUploadFieldsSchema.parse({ expected_revision: "1", expected_status: "active" }).alt_text).toBe("");
    expect(PhotoUploadFieldsSchema.safeParse({ expected_revision: "zero", expected_status: "draft" }).success).toBe(false);
  });

  it("alt-text input needs the expectations", () => {
    expect(PhotoAltTextInputSchema.safeParse({ alt_text: "x" }).success).toBe(false);
    expect(PhotoAltTextInputSchema.safeParse({ alt_text: "x", expected_status: "draft", expected_revision: 1 }).success).toBe(true);
  });
});

describe("location and logistics", () => {
  it("accepts a listed area and in-person methods", () => {
    const result = checkOfferFields("publish", { ...publishable, area: "ibadan_bodija", exchange_mode: "in_person", handover_methods: ["delivery", "collection", "collection"] }, 1);
    expect(result.ok && result.fields.handover_methods).toEqual(["collection", "delivery"]);
  });
  it("refuses an area that isn't on the list, such as an address", () => {
    const result = checkOfferFields("draft", { ...publishable, area: "12 Bodija Road" as never }, 0);
    expect(result.ok ? null : result.errors.area).toBe("Choose an area from the list.");
  });
  it("refuses in-person methods on a remote exchange, and remote service in person", () => {
    const remote = checkOfferFields("draft", { ...publishable, exchange_mode: "remote", handover_methods: ["collection"] }, 0);
    expect(remote.ok ? null : remote.errors.handover_methods).toBe("Remote exchanges can only use remote service.");
    const inPerson = checkOfferFields("draft", { ...publishable, exchange_mode: "in_person", handover_methods: ["remote_service"] }, 0);
    expect(inPerson.ok ? null : inPerson.errors.handover_methods).toBe("In-person exchanges can't use remote service.");
  });
  it("needs no location for a remote exchange", () => {
    const service: OfferFields = { ...publishable, offer_type: "service", category: "design_digital", condition: null };
    expect(checkOfferFields("publish", { ...service, exchange_mode: "remote", handover_methods: ["remote_service"] }, 1).ok).toBe(true);
  });
});

describe("services (milestone 9, V1–V6)", () => {
  const service: OfferFields = {
    ...publishable,
    offer_type: "service",
    title: "Braiding, knotless",
    category: "beauty_hair",
    condition: null,
    handover_methods: ["on_site_service"],
  };

  it("publishes a service with no condition", () => {
    expect(checkOfferFields("publish", service, 1)).toEqual({ ok: true, fields: service });
  });

  it("still needs a condition for an item", () => {
    expect(checkOfferFields("publish", { ...publishable, condition: null }, 1)).toEqual({ ok: false, errors: { condition: "Choose a condition." } });
  });

  it("refuses a category, condition or handover method from the other type", () => {
    const result = checkOfferFields("publish", { ...service, category: "electronics", condition: "good", handover_methods: ["delivery"] }, 1);
    expect(result).toEqual({
      ok: false,
      errors: {
        category: "Choose a service category.",
        condition: "Services don't have a condition.",
        handover_methods: "A service can only be done at a location or remotely.",
      },
    });
    expect(checkOfferFields("draft", { ...publishable, category: "repairs", handover_methods: ["remote_service"] }, 0)).toEqual({
      ok: false,
      errors: { category: "Choose an item category.", handover_methods: "Service options aren't available for items." },
    });
  });

  it("still needs at least one photo for a service (V4)", () => {
    expect(checkOfferFields("publish", service, 0)).toEqual({ ok: false, errors: { photos: "Add at least one photo." } });
  });
});
