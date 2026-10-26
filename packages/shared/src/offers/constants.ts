// Offer constants from specs/milestone-1.md (Data, Validation) and
// specs/state-model.md §2. Categories and conditions are the D7
// defaults; values are stable ids, labels are what the UI shows.

export const OFFER_STATUSES = ["draft", "active", "paused", "closed"] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** Milestone 9, V1: an offer is an item or a service. Existing offers are items. */
export const OFFER_TYPES = { item: "An item", service: "A service" } as const;
export type OfferType = keyof typeof OFFER_TYPES;
export const OFFER_TYPE_IDS = Object.keys(OFFER_TYPES) as [OfferType, ...OfferType[]];

export const OFFER_ITEM_CATEGORIES = {
  electronics: "Electronics",
  clothing_accessories: "Clothing and accessories",
  home_garden: "Home and garden",
  books_media: "Books and media",
  sports_outdoors: "Sports and outdoors",
  baby_kids: "Baby and kids",
  other: "Other",
} as const;

/** Milestone 9, V2: a separate list for services. */
export const OFFER_SERVICE_CATEGORIES = {
  lessons_tutoring: "Lessons and tutoring",
  beauty_hair: "Beauty and hair",
  repairs: "Repairs",
  design_digital: "Design and digital",
  cleaning_home: "Cleaning and home help",
  events: "Events",
  other_services: "Other services",
} as const;

/** Every category, for labels and the Explore chips; items first. */
export const OFFER_CATEGORIES = { ...OFFER_ITEM_CATEGORIES, ...OFFER_SERVICE_CATEGORIES } as const;
export type OfferCategory = keyof typeof OFFER_CATEGORIES;
export const OFFER_CATEGORY_IDS = Object.keys(OFFER_CATEGORIES) as [OfferCategory, ...OfferCategory[]];

/** The categories a member can choose for an item or a service. */
export function offerCategoriesFor(type: OfferType): Partial<Record<OfferCategory, string>> {
  return type === "service" ? OFFER_SERVICE_CATEGORIES : OFFER_ITEM_CATEGORIES;
}

export const categoryType = (category: OfferCategory): OfferType => (category in OFFER_SERVICE_CATEGORIES ? "service" : "item");

export const OFFER_CONDITIONS = {
  new: "New",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
} as const;
export type OfferCondition = keyof typeof OFFER_CONDITIONS;
export const OFFER_CONDITION_IDS = Object.keys(OFFER_CONDITIONS) as [OfferCondition, ...OfferCondition[]];

export const OFFER_LIMITS = {
  titleMax: 80,
  titleMinToPublish: 5,
  descriptionMax: 2000,
  shortTextMax: 200,
  shortTextMinToPublish: 3,
  altTextMax: 200,
  photosMax: 8,
  photosMinToPublish: 1,
  photoMaxBytes: 10 * 1024 * 1024,
} as const;
