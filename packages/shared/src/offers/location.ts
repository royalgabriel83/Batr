// Location visibility, phase 1 (owner, 2026-10-17). An offer may carry
// a general area from a fixed list, whether the exchange is in person,
// remote or either, and how it happens. These are the only location
// values BATR stores: no address, coordinates or free-text place. The
// ids mirror the private reference tables in
// supabase/migrations/20261017000200_offer_location.sql (parity test).

import { OFFER_SERVICE_CATEGORIES as SERVICE_CATEGORY_LABELS } from "./constants.ts";

export const OFFER_CITIES = { ibadan: "Ibadan" } as const;
export type OfferCity = keyof typeof OFFER_CITIES;

/** Areas by id. `null` area name means the whole city ("Ibadan"). */
export const OFFER_AREAS = {
  ibadan: { city: "ibadan", name: null },
  ibadan_agbowo: { city: "ibadan", name: "Agbowo" },
  ibadan_agodi: { city: "ibadan", name: "Agodi" },
  ibadan_akobo: { city: "ibadan", name: "Akobo" },
  ibadan_apata: { city: "ibadan", name: "Apata" },
  ibadan_bodija: { city: "ibadan", name: "Bodija" },
  ibadan_challenge: { city: "ibadan", name: "Challenge" },
  ibadan_dugbe: { city: "ibadan", name: "Dugbe" },
  ibadan_eleyele: { city: "ibadan", name: "Eleyele" },
  ibadan_felele: { city: "ibadan", name: "Felele" },
  ibadan_gate: { city: "ibadan", name: "Gate" },
  ibadan_iwo_road: { city: "ibadan", name: "Iwo Road" },
  ibadan_iyaganku: { city: "ibadan", name: "Iyaganku" },
  ibadan_jericho: { city: "ibadan", name: "Jericho" },
  ibadan_mokola: { city: "ibadan", name: "Mokola" },
  ibadan_molete: { city: "ibadan", name: "Molete" },
  ibadan_moniya: { city: "ibadan", name: "Moniya" },
  ibadan_odo_ona: { city: "ibadan", name: "Odo-Ona" },
  ibadan_ojoo: { city: "ibadan", name: "Ojoo" },
  ibadan_oke_ado: { city: "ibadan", name: "Oke-Ado" },
  ibadan_oluyole: { city: "ibadan", name: "Oluyole" },
  ibadan_ring_road: { city: "ibadan", name: "Ring Road" },
  ibadan_samonda: { city: "ibadan", name: "Samonda" },
  ibadan_sango: { city: "ibadan", name: "Sango" },
  ibadan_ui: { city: "ibadan", name: "University of Ibadan" },
} as const satisfies Record<string, { city: OfferCity; name: string | null }>;
export type OfferArea = keyof typeof OFFER_AREAS;
export const OFFER_AREA_IDS = Object.keys(OFFER_AREAS) as [OfferArea, ...OfferArea[]];

/** "Bodija, Ibadan", or "Ibadan" for the whole city; null when unknown. */
export function areaLabel(area: OfferArea | null | undefined): string | null {
  if (!area) return null;
  const entry = OFFER_AREAS[area] as { city: OfferCity; name: string | null } | undefined;
  if (!entry) return null;
  const city = OFFER_CITIES[entry.city];
  return entry.name ? `${entry.name}, ${city}` : city;
}

export const OFFER_EXCHANGE_MODES = {
  in_person: "In person",
  remote: "Remote",
  either: "In person or remote",
} as const;
export type OfferExchangeMode = keyof typeof OFFER_EXCHANGE_MODES;
export const OFFER_EXCHANGE_MODE_IDS = Object.keys(OFFER_EXCHANGE_MODES) as [OfferExchangeMode, ...OfferExchangeMode[]];

/**
 * How the exchange happens. `inPerson` false means it can happen
 * remotely; `service` methods are the only ones a service can use, and
 * an item can't use them (milestone 9, V6).
 */
export const OFFER_HANDOVER_METHODS = {
  collection: { label: "Collection", inPerson: true, service: false },
  delivery: { label: "Delivery", inPerson: true, service: false },
  public_meetup: { label: "Meet in a public place", inPerson: true, service: false },
  on_site_service: { label: "Service at your location", inPerson: true, service: true },
  remote_service: { label: "Remote service", inPerson: false, service: true },
} as const;
export type OfferHandoverMethod = keyof typeof OFFER_HANDOVER_METHODS;
export const OFFER_HANDOVER_METHOD_IDS = Object.keys(OFFER_HANDOVER_METHODS) as [
  OfferHandoverMethod,
  ...OfferHandoverMethod[],
];

export const LOGISTICS_MESSAGES = {
  remote: "Remote exchanges can only use remote service.",
  in_person: "In-person exchanges can't use remote service.",
} as const;

/** The combination rule; mirrors private.logistics_problem. Null when fine. */
export function logisticsProblem(
  mode: OfferExchangeMode | null,
  methods: readonly OfferHandoverMethod[],
): string | null {
  if (mode === "remote" && methods.some((m) => OFFER_HANDOVER_METHODS[m].inPerson)) return LOGISTICS_MESSAGES.remote;
  if (mode === "in_person" && methods.some((m) => !OFFER_HANDOVER_METHODS[m].inPerson)) return LOGISTICS_MESSAGES.in_person;
  return null;
}

/** Milestone 9, V2, V3 and V6: what each offer type can't have. */
export const OFFER_TYPE_MESSAGES = {
  service_category: "Choose a service category.",
  item_category: "Choose an item category.",
  service_condition: "Services don't have a condition.",
  service_method: "A service can only be done at a location or remotely.",
  item_method: "Service options aren't available for items.",
} as const;

/** Methods an offer type can use, in list order. */
export function handoverMethodsFor(type: "item" | "service"): OfferHandoverMethod[] {
  return OFFER_HANDOVER_METHOD_IDS.filter((m) => OFFER_HANDOVER_METHODS[m].service === (type === "service"));
}

/**
 * The type rules; mirrors private.offer_type_problems. Returns the
 * reason for each failing field, keyed as the database reports them.
 */
export function offerTypeProblems(
  type: "item" | "service",
  category: string | null,
  condition: string | null,
  methods: readonly OfferHandoverMethod[],
): Partial<Record<"category" | "condition" | "handover_methods", keyof typeof OFFER_TYPE_MESSAGES>> {
  const service = type === "service";
  const problems: Partial<Record<"category" | "condition" | "handover_methods", keyof typeof OFFER_TYPE_MESSAGES>> = {};
  if (category !== null && (category in SERVICE_CATEGORY_LABELS) !== service) problems.category = service ? "service_category" : "item_category";
  if (service && condition !== null) problems.condition = "service_condition";
  if (methods.some((m) => OFFER_HANDOVER_METHODS[m].service !== service)) problems.handover_methods = service ? "service_method" : "item_method";
  return problems;
}

/** Methods sorted in list order with duplicates removed (the database stores them sorted by id). */
export function normaliseHandoverMethods(methods: readonly OfferHandoverMethod[]): OfferHandoverMethod[] {
  return [...new Set(methods)].sort();
}

/** "Collection, Delivery or Meet in a public place". */
export function handoverMethodsLabel(methods: readonly OfferHandoverMethod[]): string | null {
  const labels = methods.map((m) => OFFER_HANDOVER_METHODS[m].label);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0] ?? null;
  return `${labels.slice(0, -1).join(", ")} or ${labels.at(-1) ?? ""}`;
}
