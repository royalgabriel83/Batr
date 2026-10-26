import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tokensToTailwindCss } from "@batr/shared";

describe("app/tokens.css", () => {
  it("matches the shared tokens (run `pnpm tokens:write` if this fails)", () => {
    const onDisk = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
    expect(onDisk).toBe(tokensToTailwindCss());
  });
});
