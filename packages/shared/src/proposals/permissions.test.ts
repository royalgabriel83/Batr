import { describe, expect, it } from "vitest";
import { canPropose, effectiveStatus, proposalActions, proposalBox, turnPartyId, type ProposalAccess } from "./permissions.ts";

const now = new Date("2026-10-20T12:00:00Z");
const open: ProposalAccess = {
  status: "open",
  proposer_id: "p",
  owner_id: "o",
  latest_author_id: "p",
  expires_at: "2026-11-03T12:00:00Z",
};

describe("proposal permissions", () => {
  it("reads an open proposal past its expiry as expired", () => {
    expect(effectiveStatus(open, now)).toBe("open");
    expect(effectiveStatus({ ...open, expires_at: "2026-10-20T12:00:00Z" }, now)).toBe("expired");
    expect(effectiveStatus({ ...open, status: "accepted", expires_at: "2020-01-01T00:00:00Z" }, now)).toBe("accepted");
  });

  it("gives the turn to the party who did not write the latest terms", () => {
    expect(turnPartyId(open)).toBe("o");
    expect(turnPartyId({ ...open, latest_author_id: "o" })).toBe("p");
  });

  it("lets the turn party counter, accept or decline, and the author withdraw", () => {
    expect(proposalActions(open, "o", now)).toEqual({ counter: true, accept: true, decline: true, withdraw: false });
    expect(proposalActions(open, "p", now)).toEqual({ counter: false, accept: false, decline: false, withdraw: true });
  });

  it("gives nothing to others, to visitors or once the proposal is closed or expired", () => {
    const none = { counter: false, accept: false, decline: false, withdraw: false };
    expect(proposalActions(open, "c", now)).toEqual(none);
    expect(proposalActions(open, null, now)).toEqual(none);
    expect(proposalActions({ ...open, status: "declined" }, "o", now)).toEqual(none);
    expect(proposalActions({ ...open, expires_at: "2026-10-01T00:00:00Z" }, "o", now)).toEqual(none);
  });

  it("files a proposal under Your turn, Waiting or Closed", () => {
    expect(proposalBox(open, "o", now)).toBe("turn");
    expect(proposalBox(open, "p", now)).toBe("waiting");
    expect(proposalBox({ ...open, status: "withdrawn" }, "p", now)).toBe("closed");
  });

  it("allows proposing only on another member's active offer, when signed in", () => {
    expect(canPropose("m", { owner_id: "o", status: "active" })).toBeNull();
    expect(canPropose(null, { owner_id: "o", status: "active" })).toBe("sign_in");
    expect(canPropose("o", { owner_id: "o", status: "active" })).toBe("own_offer");
    expect(canPropose("m", { owner_id: "o", status: "paused" })).toBe("unavailable");
  });
});
