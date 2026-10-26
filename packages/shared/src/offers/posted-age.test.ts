import { describe, expect, it } from "vitest";
import { handoverMethodsLabel } from "./location.ts";
import { memberSinceLabel, postedAge } from "./posted-age.ts";

const now = new Date("2026-10-17T12:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

describe("postedAge", () => {
  it("says Today within the first 24 hours", () => {
    expect(postedAge(ago(0), now)).toBe("Today");
    expect(postedAge(ago(23.9), now)).toBe("Today");
  });
  it("says Yesterday for the next 24 hours", () => {
    expect(postedAge(ago(24), now)).toBe("Yesterday");
    expect(postedAge(ago(47.9), now)).toBe("Yesterday");
  });
  it("counts days, then weeks", () => {
    expect(postedAge(ago(48), now)).toBe("2 days ago");
    expect(postedAge(ago(13 * 24), now)).toBe("13 days ago");
    expect(postedAge(ago(14 * 24), now)).toBe("2 weeks ago");
    expect(postedAge(ago(59 * 24), now)).toBe("8 weeks ago");
  });
  it("shows the date after 60 days", () => {
    expect(postedAge("2026-08-01T09:00:00Z", now)).toBe("1 Aug 2026");
  });
  it("treats a time slightly in the future (clock skew) as Today", () => {
    expect(postedAge(ago(-0.1), now)).toBe("Today");
  });
  it("returns nothing for a missing or invalid date", () => {
    expect(postedAge(null, now)).toBeNull();
    expect(postedAge("not a date", now)).toBeNull();
  });
});

describe("memberSinceLabel", () => {
  it("writes the month in full", () => {
    expect(memberSinceLabel("2026-10")).toBe("October 2026");
  });
  it("gives nothing for a missing or malformed value", () => {
    expect(memberSinceLabel(null)).toBeNull();
    expect(memberSinceLabel("October")).toBeNull();
  });
});

describe("handoverMethodsLabel", () => {
  it("joins the methods in a sentence", () => {
    expect(handoverMethodsLabel([])).toBeNull();
    expect(handoverMethodsLabel(["collection"])).toBe("Collection");
    expect(handoverMethodsLabel(["collection", "delivery", "public_meetup"])).toBe("Collection, Delivery or Meet in a public place");
  });
});
