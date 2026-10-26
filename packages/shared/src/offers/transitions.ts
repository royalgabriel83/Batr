import type { OfferStatus } from "./constants.ts";
import type { RuleResult } from "./errors.ts";
import { canCreateOffer, canWriteOffer, type Actor, type OfferAccess } from "./permissions.ts";

// The offer state machine, exactly as specs/state-model.md §2. The
// database keeps an identical table (unit 04); a parity test compares
// them. Photo add, remove, reorder and alt text are "edit".

export const OFFER_ACTIONS = ["create", "edit", "publish", "pause", "resume", "close", "delete"] as const;
export type OfferAction = (typeof OFFER_ACTIONS)[number];

export type OfferTransitionRule = {
  readonly action: OfferAction;
  /** `null` means the offer does not exist yet (create). */
  readonly from: OfferStatus | null;
  /** `null` means the offer is removed (draft delete). */
  readonly to: OfferStatus | null;
};

export const OFFER_TRANSITIONS: readonly OfferTransitionRule[] = [
  { action: "create", from: null, to: "draft" },
  { action: "edit", from: "draft", to: "draft" },
  { action: "edit", from: "active", to: "active" },
  { action: "edit", from: "paused", to: "paused" },
  { action: "publish", from: "draft", to: "active" },
  { action: "pause", from: "active", to: "paused" },
  { action: "resume", from: "paused", to: "active" },
  { action: "close", from: "active", to: "closed" },
  { action: "close", from: "paused", to: "closed" },
  { action: "delete", from: "draft", to: null },
];

/** Actions that need publish rules to pass after they apply. */
export function requiresPublishRules(action: OfferAction, from: OfferStatus | null): boolean {
  if (action === "publish" || action === "resume") return true;
  return action === "edit" && (from === "active" || from === "paused");
}

function findRule(from: OfferStatus | null, action: OfferAction): OfferTransitionRule | undefined {
  return OFFER_TRANSITIONS.find((rule) => rule.action === action && rule.from === from);
}

/** The status after `action`, or `undefined` when the table has no such transition. */
export function nextOfferStatus(from: OfferStatus | null, action: OfferAction): OfferStatus | null | undefined {
  return findRule(from, action)?.to;
}

/** What the client last saw; sent with every mutation on an existing offer. */
export type OfferExpectations = { expected_status: OfferStatus; expected_revision: number };

/** The current offer as the server reads it under the row lock. */
export type OfferSnapshot = OfferAccess & { revision: number };

export type TransitionRequest =
  | { action: "create"; actor: Actor }
  | ({ action: Exclude<OfferAction, "create">; actor: Actor; offer: OfferSnapshot } & OfferExpectations);

/**
 * Whether `actor` may take `action` on an offer currently in `from`.
 * Checks the actor, then the table. Does not check revisions or field
 * rules; `transitionOffer` adds the revision and status expectations.
 */
export function canTransition(
  from: OfferStatus | null,
  action: OfferAction,
  actor: Actor,
  offer?: OfferAccess,
): RuleResult<OfferStatus | null> {
  const permission = offer === undefined ? canCreateOffer(actor) : canWriteOffer(actor, offer);
  if (permission) return { ok: false, error: permission };
  const rule = findRule(from, action);
  if (!rule) return { ok: false, error: { code: "CONFLICT", reason: "status_changed", current_status: from } };
  return { ok: true, value: rule.to };
}

/**
 * Pre-check for an offer action, in the order the API reports errors:
 * signed in (401), owner (403/404), status the client expected (409
 * status_changed), revision the client expected (409 stale_revision),
 * then the transition table (409). The database repeats every check
 * under the row lock; this function gives early, clear errors.
 */
export function transitionOffer(request: TransitionRequest): RuleResult<OfferStatus | null> {
  if (request.action === "create") return canTransition(null, "create", request.actor);
  const { offer, actor, action } = request;
  const permission = canWriteOffer(actor, offer);
  if (permission) return { ok: false, error: permission };
  if (request.expected_status !== offer.status) {
    return { ok: false, error: { code: "CONFLICT", reason: "status_changed", current_status: offer.status } };
  }
  if (request.expected_revision !== offer.revision) {
    return { ok: false, error: { code: "CONFLICT", reason: "stale_revision", current_revision: offer.revision } };
  }
  return canTransition(offer.status, action, actor, offer);
}
