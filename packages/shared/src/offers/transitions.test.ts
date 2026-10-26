import { describe, expect, it } from "vitest";
import { OFFER_STATUSES, type OfferStatus } from "./constants.ts";
import {
  OFFER_ACTIONS,
  OFFER_TRANSITIONS,
  canTransition,
  nextOfferStatus,
  requiresPublishRules,
  transitionOffer,
  type OfferAction,
} from "./transitions.ts";
import { anonymous, otherMember, owner, ownerId } from "./test-helpers.ts";

const STATES: (OfferStatus | null)[] = [null, ...OFFER_STATUSES];

// specs/state-model.md §2, written out independently of the source table.
const EXPECTED: Record<string, OfferStatus | null> = {
  "create:none": "draft",
  "edit:draft": "draft",
  "edit:active": "active",
  "edit:paused": "paused",
  "publish:draft": "active",
  "pause:active": "paused",
  "resume:paused": "active",
  "close:active": "closed",
  "close:paused": "closed",
  "delete:draft": null,
};
const key = (action: OfferAction, from: OfferStatus | null) => `${action}:${from ?? "none"}`;

describe("offer transition table", () => {
  it("matches state-model.md §2 exactly", () => {
    const table = Object.fromEntries(OFFER_TRANSITIONS.map((rule) => [key(rule.action, rule.from), rule.to]));
    expect(table).toEqual(EXPECTED);
    expect(OFFER_TRANSITIONS).toHaveLength(Object.keys(EXPECTED).length);
  });

  it("never reopens a closed offer or returns an offer to draft", () => {
    expect(OFFER_TRANSITIONS.some((rule) => rule.from === "closed")).toBe(false);
    expect(OFFER_TRANSITIONS.some((rule) => rule.to === "draft" && rule.from !== null && rule.from !== "draft")).toBe(
      false,
    );
  });

  for (const action of OFFER_ACTIONS) {
    for (const from of STATES) {
      const expected = EXPECTED[key(action, from)];
      const allowed = key(action, from) in EXPECTED;
      it(`${action} from ${from ?? "nothing"} is ${allowed ? "allowed" : "refused"} for the owner`, () => {
        const offer = from === null ? undefined : { owner_id: ownerId, status: from };
        const result = canTransition(from, action, owner, offer);
        expect(nextOfferStatus(from, action)).toBe(allowed ? expected : undefined);
        if (allowed) expect(result).toEqual({ ok: true, value: expected });
        else expect(result).toEqual({ ok: false, error: { code: "CONFLICT", reason: "status_changed", current_status: from } });
      });
    }
  }
});

describe("who may act", () => {
  it("lets any signed-in member create a draft, but not a signed-out visitor", () => {
    expect(canTransition(null, "create", otherMember)).toEqual({ ok: true, value: "draft" });
    expect(canTransition(null, "create", anonymous)).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });

  for (const rule of OFFER_TRANSITIONS.filter((r) => r.from !== null)) {
    const from = rule.from as OfferStatus;
    const offer = { owner_id: ownerId, status: from };
    it(`refuses ${rule.action} from ${from} to a signed-out visitor and another member`, () => {
      expect(canTransition(from, rule.action, anonymous, offer)).toEqual({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
      expect(canTransition(from, rule.action, otherMember, offer)).toEqual({
        ok: false,
        error: { code: from === "active" ? "FORBIDDEN" : "NOT_FOUND" },
      });
    });
  }
});

describe("transitionOffer", () => {
  const draft = { owner_id: ownerId, status: "draft" as const, revision: 3 };

  it("creates a draft for a member", () => {
    expect(transitionOffer({ action: "create", actor: owner })).toEqual({ ok: true, value: "draft" });
    expect(transitionOffer({ action: "create", actor: anonymous }).ok).toBe(false);
  });

  it("applies an allowed action when status and revision match", () => {
    const result = transitionOffer({ action: "publish", actor: owner, offer: draft, expected_status: "draft", expected_revision: 3 });
    expect(result).toEqual({ ok: true, value: "active" });
  });

  it("reports a changed status before a stale revision", () => {
    const result = transitionOffer({ action: "publish", actor: owner, offer: draft, expected_status: "active", expected_revision: 2 });
    expect(result).toEqual({ ok: false, error: { code: "CONFLICT", reason: "status_changed", current_status: "draft" } });
  });

  it("refuses a stale revision with the current revision", () => {
    const result = transitionOffer({ action: "edit", actor: owner, offer: draft, expected_status: "draft", expected_revision: 2 });
    expect(result).toEqual({ ok: false, error: { code: "CONFLICT", reason: "stale_revision", current_revision: 3 } });
  });

  it("refuses an action the table does not allow", () => {
    const closed = { owner_id: ownerId, status: "closed" as const, revision: 9 };
    const result = transitionOffer({ action: "publish", actor: owner, offer: closed, expected_status: "closed", expected_revision: 9 });
    expect(result).toEqual({ ok: false, error: { code: "CONFLICT", reason: "status_changed", current_status: "closed" } });
  });

  it("checks permission before expectations, so a non-owner learns nothing", () => {
    const result = transitionOffer({ action: "edit", actor: otherMember, offer: draft, expected_status: "active", expected_revision: 1 });
    expect(result).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("requiresPublishRules", () => {
  it("is true for publish, resume and edits of active or paused offers", () => {
    expect(requiresPublishRules("publish", "draft")).toBe(true);
    expect(requiresPublishRules("resume", "paused")).toBe(true);
    expect(requiresPublishRules("edit", "active")).toBe(true);
    expect(requiresPublishRules("edit", "paused")).toBe(true);
  });

  it("is false for draft edits and the other actions", () => {
    expect(requiresPublishRules("edit", "draft")).toBe(false);
    expect(requiresPublishRules("create", null)).toBe(false);
    for (const action of ["pause", "close", "delete"] as const) expect(requiresPublishRules(action, "active")).toBe(false);
  });
});
