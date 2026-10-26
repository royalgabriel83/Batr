import { describe, expect, it } from "vitest";
import { SYSTEM_EVENTS } from "./constants.ts";
import { notificationText, systemLineText } from "./text.ts";

describe("systemLineText", () => {
  it("reads from the viewer's side", () => {
    expect(systemLineText("proposal.counter", "you", "Ada")).toBe("You sent a counteroffer.");
    expect(systemLineText("proposal.counter", "them", "Ada")).toBe("Ada sent a counteroffer.");
    expect(systemLineText("agreement.withdraw_cancel", "them", "Ada")).toBe("Ada withdrew their request to cancel.");
  });

  it("names nobody for what BATR did", () => {
    expect(systemLineText("proposal.expire", null, "Ada")).toBe("The proposal expired.");
    expect(systemLineText("proposal.auto_decline", null, "Ada")).toBe("The proposal was declined because the offer was closed.");
  });

  it("has a sentence for every event", () => {
    for (const event of SYSTEM_EVENTS) {
      expect(systemLineText(event, "them", "Ada")).toMatch(/\.$/);
      expect(systemLineText(event, "you", "Ada")).not.toContain("{name}");
    }
  });
});

describe("notificationText", () => {
  it("counts grouped messages", () => {
    expect(notificationText("message", "Bayo")).toBe("Bayo sent you a message.");
    expect(notificationText("message", "Bayo", 3)).toBe("Bayo sent you 3 messages.");
  });

  it("speaks to the recipient about a new proposal", () => {
    expect(notificationText("proposal.create", "Bayo")).toBe("Bayo sent you a proposal.");
  });

  it("uses the other member's line for events", () => {
    expect(notificationText("agreement.handover", "Bayo")).toBe("Bayo confirmed their handover.");
    expect(notificationText("proposal.expire", null)).toBe("The proposal expired.");
    expect(notificationText("message", null)).toBe("A member sent you a message.");
  });
});
