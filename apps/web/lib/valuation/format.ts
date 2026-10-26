import { COMPONENT_KINDS, categoriesFor, type ComponentKind } from "@batr/shared";

/** "Galaxy A54", "Painting" or the category, for lists and headings. */
export function componentTitle(component: { kind: ComponentKind; category: string | null; details: Record<string, unknown> }): string {
  const name = component.details.product_name ?? component.details.service_type;
  if (typeof name === "string" && name.trim()) return name;
  if (component.category) return categoriesFor(component.kind)[component.category] ?? COMPONENT_KINDS[component.kind];
  return COMPONENT_KINDS[component.kind];
}

/** Kobo to the text in a naira input ("90000" or "1500.50"). */
export function koboToInput(kobo: number | null): string {
  if (kobo === null) return "";
  const naira = Math.trunc(kobo / 100);
  const rest = kobo % 100;
  return rest === 0 ? String(naira) : `${String(naira)}.${String(rest).padStart(2, "0")}`;
}

export const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${String(Math.ceil(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);
