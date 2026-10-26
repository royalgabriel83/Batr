import { termsChanges, type ChangeChip } from "./changes.ts";
import { formatNaira, type Cash } from "./schemas.ts";
import type { ItemView, PartyRole as Role, RevisionView } from "./views.ts";

// Terms as the viewer reads them: "You give" and "You get" rather than
// the stored proposer and owner sides (specs/milestone-3.md, user
// journey 2 and 6). Pure, so both apps and their tests share it.

export const otherRole = (role: Role): Role =>
  role === "proposer" ? "owner" : "proposer";

/** The proposer gives `gives`; the owner gives `gets`. */
export function sidesFor<T>(
  role: Role,
  terms: { gives: T[]; gets: T[] },
): { give: T[]; get: T[] } {
  return role === "proposer"
    ? { give: terms.gives, get: terms.gets }
    : { give: terms.gets, get: terms.gives };
}

/** A member's name as the viewer reads it; members without one are "the other member". */
export const nameOr = (
  name: string | null | undefined,
  fallback = "The other member",
) => name?.trim() || fallback;

/** "You pay ₦20,000" or "Ada pays ₦20,000"; null without cash. */
export function cashLabel(
  cash: Cash | null,
  viewer: Role,
  otherName: string,
): string | null {
  if (!cash) return null;
  return cash.payer === viewer
    ? `You pay ${formatNaira(cash.amount_naira)}`
    : `${otherName} pays ${formatNaira(cash.amount_naira)}`;
}

/** An item in a sentence: the offer's title at the time, or the description. */
export const itemLabel = (item: ItemView): string =>
  item.kind === "offer" ? item.snapshot.title || "An offer" : item.description;

const isService = (item: ItemView) => item.kind === "offer" && item.snapshot.offer_type === "service";

/**
 * "item" or "service" for the offers among `ids` (milestone 9, V5):
 * "service" only when every one of them is a service. Snapshots taken
 * before services have no type and read as items.
 */
export function changedWord(items: ItemView[], ids: readonly string[]): "item" | "service" {
  const changed = items.filter((item) => item.kind === "offer" && ids.includes(item.offer_id));
  return changed.length > 0 && changed.every(isService) ? "service" : "item";
}

/** What the handover dialog asks for (milestone 9, V6): a service is confirmed once it has been done. */
export function handoverInstruction(items: ItemView[]): string {
  const offers = items.filter((item) => item.kind === "offer");
  if (offers.length > 0 && offers.every(isService)) return "Confirm only once the service has been done.";
  if (offers.some(isService)) return "Confirm only once you've handed over your side and the service has been done.";
  return "Confirm only once you've handed over your side.";
}

/** "Road bike and a phone charger". */
export function itemsSentence(items: ItemView[]): string {
  const labels = items.map(itemLabel);
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
}

/**
 * What an exchange is about, for list rows: the listed offer it was
 * proposed on, as written in the terms, so rows lead with the product
 * and not the person (UI review, 2026-10-23). Falls back to the first
 * offer on either side, then to the first described item.
 */
export function exchangeTitle(terms: { gives: ItemView[]; gets: ItemView[] }, offerId?: string | null): string {
  const items = [...terms.gets, ...terms.gives];
  const listed = items.find((item) => item.kind === "offer" && item.offer_id === offerId);
  const first = listed ?? items.find((item) => item.kind === "offer") ?? items[0];
  return first ? itemLabel(first) : "An exchange";
}

type Terms = Pick<RevisionView, "gives" | "gets" | "cash" | "note">;

/** Change chips from the previous revision (or agreement version), or none for the first. */
export function chipsFor(
  previous: Terms | undefined,
  revision: Terms,
): ChangeChip[] {
  return previous ? termsChanges(previous, revision).chips : [];
}

const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});
const dateOnly = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "Africa/Lagos",
});

/** "20 Oct, 10:56" in Nigerian time, where BATR's members are. */
export const formatWhen = (iso: string): string =>
  dateTime.format(new Date(iso));
const recordTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Lagos",
});
/**
 * "20 Oct 2026, 10:56 WAT": for the agreement's record (acceptance,
 * each handover, completion, cancellation, versions), where the year
 * and time zone matter if anyone checks it later.
 */
export const formatRecordTime = (iso: string): string =>
  `${recordTime.format(new Date(iso))} WAT`;
/**
 * A short reference for an exchange or agreement ("Ref. 95545102"), shown
 * under the product name so members and BATR can point to one record.
 * Only a label: the full id is what the API uses.
 */
export const shortRef = (id: string): string => `Ref. ${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
/** "3 November". */
export const formatDay = (iso: string): string =>
  dateOnly.format(new Date(iso));
