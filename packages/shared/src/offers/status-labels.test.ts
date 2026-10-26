import { describe, expect, it } from "vitest";
import { OFFER_STATUSES } from "./constants.ts";
import { offerStatusLabel } from "./status-labels.ts";

describe("offer status labels", () => {
  it("match context/ui-context.md (Status indicators)", () => {
    expect(Object.fromEntries(OFFER_STATUSES.map((s) => [s, offerStatusLabel(s)]))).toEqual({
      draft: { label: "Draft", tone: "neutral" },
      active: { label: "Active", tone: "success" },
      paused: { label: "Paused", tone: "warning" },
      closed: { label: "Closed", tone: "neutral" },
    });
  });
});
