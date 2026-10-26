import type { OfferStatus } from "./constants.ts";

// The only offer status labels the UI may show (context/ui-context.md,
// Status indicators). Icons are chosen in the web app per tone.

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";
export type StatusLabel = { label: string; tone: StatusTone };

const OFFER_STATUS_LABELS = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  closed: { label: "Closed", tone: "neutral" },
} as const satisfies Record<OfferStatus, StatusLabel>;

export function offerStatusLabel(status: OfferStatus): StatusLabel {
  return OFFER_STATUS_LABELS[status];
}
