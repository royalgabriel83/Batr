import { describe, expect, it } from "vitest";
import { areaLabel, logisticsProblem, OFFER_AREA_IDS } from "./location.ts";

describe("areaLabel", () => {
  it("names the area and city, or the city alone", () => {
    expect(areaLabel("ibadan_bodija")).toBe("Bodija, Ibadan");
    expect(areaLabel("ibadan")).toBe("Ibadan");
  });
  it("is null when the area is unknown, never a guess", () => {
    expect(areaLabel(null)).toBeNull();
    expect(areaLabel("lagos_ikeja" as never)).toBeNull();
  });
  it("has Ibadan only for now", () => {
    expect(OFFER_AREA_IDS.every((id) => id.startsWith("ibadan"))).toBe(true);
  });
});

describe("logisticsProblem", () => {
  it("allows either mode with any methods, and no mode at all", () => {
    expect(logisticsProblem("either", ["collection", "remote_service"])).toBeNull();
    expect(logisticsProblem(null, ["delivery"])).toBeNull();
  });
});
