import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_PATH, safeReturnPath, signInPathFor } from "./return-path.ts";

describe("safeReturnPath", () => {
  it.each([
    ["/account", "/account"],
    ["/offers/123?tab=photos#top", "/offers/123?tab=photos#top"],
    ["/search?q=a%20b", "/search?q=a%20b"],
  ])("keeps same-site path %j", (next, expected) => {
    expect(safeReturnPath(next)).toBe(expected);
  });

  it.each([
    null,
    undefined,
    "",
    "account",
    "https://evil.example/",
    "//evil.example/",
    "/\\evil.example/",
    "/\t/evil.example",
    "/\n/evil.example",
    "/sign-in",
    "/sign-in?next=/x",
    "/sign-up/check-email",
    "/auth/confirm",
  ])("falls back for %j", (next) => {
    expect(safeReturnPath(next)).toBe(DEFAULT_RETURN_PATH);
  });

  it("does not treat a path that only starts with an auth word as an auth page", () => {
    expect(safeReturnPath("/authors")).toBe("/authors");
  });

  it("builds a sign-in link that returns to the page", () => {
    expect(signInPathFor("/offers/new?x=1")).toBe("/sign-in?next=%2Foffers%2Fnew%3Fx%3D1");
    expect(signInPathFor("//evil.example")).toBe("/sign-in?next=%2Faccount");
  });
});
