import type { Cash } from "./schemas.ts";

// Change chips between two revisions (specs/milestone-3.md, user
// journey 6): Added, Removed, Updated (the same offer with refreshed
// terms after a material edit), Cash changed and Note. Every field of
// the terms is material; the note is not (state-model.md §3).

export type ComparableItem =
  | { kind: "offer"; offer_id: string; content_version?: number; snapshot?: { title: string } }
  | { kind: "text"; description: string };

export interface ComparableTerms {
  gives: ComparableItem[];
  gets: ComparableItem[];
  cash: Cash | null;
  note?: string;
}

export const CHANGE_CHIPS = {
  added: "Added",
  removed: "Removed",
  updated: "Updated",
  cash: "Cash changed",
  note: "Note",
} as const;
export type ChangeChip = keyof typeof CHANGE_CHIPS;

export interface TermsChanges {
  chips: ChangeChip[];
  added: ComparableItem[];
  removed: ComparableItem[];
  updated: ComparableItem[];
}

/** What makes two items the same item: the offer, or the exact description. */
export function itemKey(item: ComparableItem): string {
  return item.kind === "offer" ? `offer:${item.offer_id}` : `text:${item.description}`;
}

function sideChanges(previous: ComparableItem[], next: ComparableItem[], into: TermsChanges) {
  const before = new Map(previous.map((item) => [itemKey(item), item]));
  const after = new Map(next.map((item) => [itemKey(item), item]));
  for (const [key, item] of after) {
    const old = before.get(key);
    if (!old) into.added.push(item);
    else if (
      item.kind === "offer" &&
      old.kind === "offer" &&
      item.content_version !== undefined &&
      old.content_version !== undefined &&
      item.content_version !== old.content_version
    ) {
      into.updated.push(item);
    }
  }
  for (const [key, item] of before) if (!after.has(key)) into.removed.push(item);
}

const sameCash = (a: Cash | null, b: Cash | null) => a?.amount_naira === b?.amount_naira && a?.payer === b?.payer;

/** The changes from `previous` to `next`, in chip order. */
export function termsChanges(previous: ComparableTerms, next: ComparableTerms): TermsChanges {
  const changes: TermsChanges = { chips: [], added: [], removed: [], updated: [] };
  sideChanges(previous.gives, next.gives, changes);
  sideChanges(previous.gets, next.gets, changes);
  if (changes.added.length > 0) changes.chips.push("added");
  if (changes.removed.length > 0) changes.chips.push("removed");
  if (changes.updated.length > 0) changes.chips.push("updated");
  if (!sameCash(previous.cash, next.cash)) changes.chips.push("cash");
  if ((previous.note ?? "") !== (next.note ?? "") && (next.note ?? "") !== "") changes.chips.push("note");
  return changes;
}

/** A counter must change the terms, not only the note (milestone-3.md, Counter). */
export function differsMaterially(previous: ComparableTerms, next: ComparableTerms): boolean {
  return termsChanges(previous, next).chips.some((chip) => chip !== "note");
}
