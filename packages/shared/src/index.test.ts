import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "./index.ts";

describe("@batr/shared", () => {
  it("exports the product name used by the apps", () => {
    expect(PRODUCT_NAME).toBe("BATR");
  });
});
