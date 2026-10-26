import { describe, expect, it } from "vitest";
import { initialOf } from "./MemberInitial";

describe("initialOf", () => {
  it.each([
    ["Sarah T", "S"],
    ["  ada lovelace", "A"],
    ["élodie", "É"],
    ["🙂 Sam", "🙂"],
    ["", ""],
    ["   ", ""],
    [null, ""],
  ])("%j → %j", (name, expected) => {
    expect(initialOf(name)).toBe(expected);
  });
});
