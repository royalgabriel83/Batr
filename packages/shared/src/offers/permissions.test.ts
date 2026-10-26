import { describe, expect, it } from "vitest";
import { OFFER_STATUSES } from "./constants.ts";
import { canCreateOffer, canReadOffer, canWriteOffer, isPubliclyVisible, offerRole } from "./permissions.ts";
import { anonymous, otherMember, owner, ownerId } from "./test-helpers.ts";

describe("offer permissions", () => {
  it("works out the viewer's role", () => {
    const offer = { owner_id: ownerId, status: "active" as const };
    expect(offerRole(owner, offer)).toBe("owner");
    expect(offerRole(otherMember, offer)).toBe("member");
    expect(offerRole(anonymous, offer)).toBe("anonymous");
  });

  it("treats only active offers as public", () => {
    expect(OFFER_STATUSES.filter(isPubliclyVisible)).toEqual(["active"]);
  });

  it("lets only signed-in members create offers", () => {
    expect(canCreateOffer(owner)).toBeNull();
    expect(canCreateOffer(anonymous)).toEqual({ code: "UNAUTHENTICATED" });
  });

  for (const status of OFFER_STATUSES) {
    const offer = { owner_id: ownerId, status };

    it(`reading a ${status} offer`, () => {
      expect(canReadOffer(owner, offer)).toBeNull();
      const others = status === "active" ? null : { code: "NOT_FOUND" };
      expect(canReadOffer(otherMember, offer)).toEqual(others);
      expect(canReadOffer(anonymous, offer)).toEqual(others);
    });

    it(`writing a ${status} offer`, () => {
      expect(canWriteOffer(owner, offer)).toBeNull();
      expect(canWriteOffer(otherMember, offer)).toEqual({ code: status === "active" ? "FORBIDDEN" : "NOT_FOUND" });
      expect(canWriteOffer(anonymous, offer)).toEqual({ code: "UNAUTHENTICATED" });
    });
  }
});
