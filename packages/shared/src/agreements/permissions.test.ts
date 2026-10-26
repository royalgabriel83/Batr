import { describe, expect, it } from "vitest";
import { agreementActions, agreementBox, agreementWaitsOn, type AgreementAccess } from "./permissions.ts";

const active: AgreementAccess = {
  status: "active",
  proposer_id: "p",
  owner_id: "o",
  confirmed_by: [],
  pending_by: null,
  cancel_requested_by: null,
};
const none = {
  handover: false,
  propose_change: false,
  accept_change: false,
  reject_change: false,
  withdraw_change: false,
  request_cancel: false,
  accept_cancel: false,
  reject_cancel: false,
  withdraw_cancel: false,
};

describe("agreement permissions", () => {
  it("pauses handover and changes while a problem is open, but not cancelling (milestone 8, D2)", () => {
    expect(agreementActions({ ...active, paused: true }, "p")).toEqual({ ...none, request_cancel: true });
    const pending: AgreementAccess = { ...active, status: "amendment_pending", pending_by: "o", paused: true };
    expect(agreementActions(pending, "p")).toEqual({ ...none, reject_change: true });
    expect(agreementActions(pending, "o")).toEqual({ ...none, withdraw_change: true });
  });

  it("lets either party hand over, propose a change or ask to cancel while active", () => {
    for (const viewer of ["p", "o"]) {
      expect(agreementActions(active, viewer)).toEqual({ ...none, handover: true, propose_change: true, request_cancel: true });
    }
  });

  it("after one handover: no changes (D4), the other may still hand over, both may ask to cancel (A3)", () => {
    const half = { ...active, confirmed_by: ["o"] };
    expect(agreementActions(half, "o")).toEqual({ ...none, request_cancel: true });
    expect(agreementActions(half, "p")).toEqual({ ...none, handover: true, request_cancel: true });
  });

  it("lets only the other party answer a change, and its proposer withdraw it", () => {
    const pending = { ...active, status: "amendment_pending" as const, pending_by: "p" };
    expect(agreementActions(pending, "o")).toEqual({ ...none, accept_change: true, reject_change: true });
    expect(agreementActions(pending, "p")).toEqual({ ...none, withdraw_change: true });
  });

  it("lets only the other party answer a cancellation request, and its requester withdraw it", () => {
    const asked = { ...active, status: "cancellation_requested" as const, cancel_requested_by: "o" };
    expect(agreementActions(asked, "p")).toEqual({ ...none, accept_cancel: true, reject_cancel: true });
    expect(agreementActions(asked, "o")).toEqual({ ...none, withdraw_cancel: true });
  });

  it("gives nothing to others, to visitors or once completed or cancelled", () => {
    expect(agreementActions(active, "c")).toEqual(none);
    expect(agreementActions(active, null)).toEqual(none);
    expect(agreementActions({ ...active, status: "completed", confirmed_by: ["p", "o"] }, "p")).toEqual(none);
    expect(agreementActions({ ...active, status: "cancelled" }, "o")).toEqual(none);
  });

  it("waits on a party with something to answer, or a handover after the other's (A5)", () => {
    expect(agreementWaitsOn(active, "p")).toBe(false);
    expect(agreementWaitsOn({ ...active, confirmed_by: ["o"] }, "p")).toBe(true);
    expect(agreementWaitsOn({ ...active, confirmed_by: ["o"] }, "o")).toBe(false);
    expect(agreementWaitsOn({ ...active, status: "amendment_pending", pending_by: "o" }, "p")).toBe(true);
    expect(agreementWaitsOn({ ...active, status: "amendment_pending", pending_by: "o" }, "o")).toBe(false);
    expect(agreementWaitsOn({ ...active, status: "cancellation_requested", cancel_requested_by: "p" }, "o")).toBe(true);
    expect(agreementWaitsOn({ ...active, confirmed_by: ["o"] }, "c")).toBe(false);
  });

  it("files completed and cancelled agreements under Closed (A6)", () => {
    expect(agreementBox(active)).toBe("active");
    expect(agreementBox({ status: "amendment_pending" })).toBe("active");
    expect(agreementBox({ status: "cancellation_requested" })).toBe("active");
    expect(agreementBox({ status: "completed" })).toBe("closed");
    expect(agreementBox({ status: "cancelled" })).toBe("closed");
  });
});
