import { describe, expect, it } from "vitest";
import { API_ERROR_MESSAGES } from "@batr/shared";
import { toResult } from "./api-client";

describe("toResult", () => {
  it("returns data for a success body", () => {
    expect(toResult(201, { data: { id: "x" } })).toEqual({ ok: true, data: { id: "x" } });
  });
  it("keeps the API's error details", () => {
    expect(toResult(409, { error: { code: "CONFLICT", message: "Changed", reason: "stale_revision", current_revision: 4 } })).toEqual({
      ok: false,
      status: 409,
      error: { code: "CONFLICT", message: "Changed", reason: "stale_revision", current_revision: 4 },
    });
  });
  it("fills in a missing message from the shared table", () => {
    expect(toResult(404, { error: { code: "NOT_FOUND" } })).toMatchObject({ error: { message: API_ERROR_MESSAGES.NOT_FOUND } });
  });
  it("treats anything else as an internal error", () => {
    expect(toResult(502, null)).toEqual({ ok: false, status: 502, error: { code: "INTERNAL", message: API_ERROR_MESSAGES.INTERNAL } });
    expect(toResult(500, { error: { code: "SOMETHING" } })).toMatchObject({ error: { code: "INTERNAL" } });
    expect(toResult(200, "ok")).toMatchObject({ ok: false });
  });
});
