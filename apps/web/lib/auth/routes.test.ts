import { describe, expect, it } from "vitest";
import { isProtectedPath } from "./routes";

describe("isProtectedPath", () => {
  it.each([
    ["/account", true],
    ["/account/settings", true],
    ["/accounts", false],
    ["/", false],
    ["/sign-in", false],
    ["/my-offers", true],
    ["/offers/new", true],
    ["/offers/0b7c/edit", true],
    ["/offers/0b7c/published", true],
    ["/offers/0b7c", false],
    ["/offers", false],
    ["/moderation", true],
    ["/moderation/0b7c", true],
  ])("%s → %s", (path, expected) => {
    expect(isProtectedPath(path)).toBe(expected);
  });
});
