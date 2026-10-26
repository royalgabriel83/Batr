import { describe, expect, it } from "vitest";
import { checkInput } from "../offers/schemas.ts";
import { CANCEL_REASON_MESSAGES, CancellationActionInputSchema, CancellationInputSchema, HandoverInputSchema, ProposeChangeInputSchema } from "./schemas.ts";

const id = "6f1c2c1e-3f43-4d7a-9a55-0c6a3e0f9b11";
const other = "0b9e8f37-5d1b-4b8a-8b52-6a0ad2b3c1d4";

describe("agreement inputs", () => {
  it("names the exact version or request", () => {
    expect(checkInput(HandoverInputSchema, { version_id: id }).ok).toBe(true);
    expect(checkInput(HandoverInputSchema, { version_id: "v1" }).ok).toBe(false);
    expect(checkInput(CancellationActionInputSchema, { request_id: id }).ok).toBe(true);
    expect(checkInput(CancellationActionInputSchema, { request_id: id, extra: 1 }).ok).toBe(false);
  });

  it("checks a change like proposal terms, against the binding version", () => {
    const terms = { gives: [{ kind: "offer", offer_id: other }], gets: [{ kind: "offer", offer_id: id }] };
    expect(checkInput(ProposeChangeInputSchema, { expected_version: 1, ...terms })).toMatchObject({ ok: true, data: { cash: null, note: "" } });
    expect(checkInput(ProposeChangeInputSchema, { ...terms }).ok).toBe(false);
    expect(checkInput(ProposeChangeInputSchema, { expected_version: 1, ...terms, gives: [{ kind: "offer", offer_id: id }] }).ok).toBe(false);
  });

  it("needs a cancellation reason of 3 to 500 characters", () => {
    expect(checkInput(CancellationInputSchema, { reason: "  The lens is cracked. " })).toEqual({ ok: true, data: { reason: "The lens is cracked." } });
    expect(checkInput(CancellationInputSchema, { reason: " no " })).toEqual({ ok: false, errors: { reason: CANCEL_REASON_MESSAGES.tooShort } });
    expect(checkInput(CancellationInputSchema, { reason: "x".repeat(501) })).toEqual({ ok: false, errors: { reason: CANCEL_REASON_MESSAGES.tooLong } });
  });
});
