import { EMPTY_OFFER_FIELDS, OfferFieldsSchema, type OfferFields } from "@batr/shared";

// Unsaved typing on the offer form is kept in this browser tab's
// session storage while it differs from the saved offer. It comes back
// when the member returns to the same form after a refresh, the Back
// button, or signing in again when their session ended
// (02-offer-creation.md, Failure cases). Nothing leaves the browser,
// and it is gone when the tab closes.

const PREFIX = "batr:offer-form:";

export const backupKey = (offerId: string | null) => `${PREFIX}${offerId ?? "new"}`;

/** What the member typed, and the offer revision it was typed against (null for a new offer). */
export interface Backup {
  values: OfferFields;
  revision: number | null;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const browserStore = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

export function saveBackup(offerId: string | null, values: OfferFields, revision: number | null, store: Store | null = browserStore()): void {
  try {
    store?.setItem(backupKey(offerId), JSON.stringify({ values, revision }));
  } catch {
    // Storage full or blocked: nothing is kept.
  }
}

export function clearBackup(offerId: string | null, store: Store | null = browserStore()): void {
  try {
    store?.removeItem(backupKey(offerId));
  } catch {
    // Blocked storage holds nothing to clear.
  }
}

/** The kept typing, removed once read; null when there is none or it is not valid. */
export function takeBackup(offerId: string | null, store: Store | null = browserStore()): Backup | null {
  try {
    const raw = store?.getItem(backupKey(offerId));
    if (!raw) return null;
    store?.removeItem(backupKey(offerId));
    const kept = JSON.parse(raw) as { values?: unknown; revision?: unknown };
    const parsed = OfferFieldsSchema.safeParse({ ...EMPTY_OFFER_FIELDS, ...(kept.values as object) });
    if (!parsed.success) return null;
    return { values: parsed.data, revision: typeof kept.revision === "number" ? kept.revision : null };
  } catch {
    return null;
  }
}
