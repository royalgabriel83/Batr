import { describe, expect, it } from "vitest";
import { AUTH_MESSAGES } from "@batr/shared";
import { authErrorKey, authErrorMessage } from "./errors";

describe("authErrorKey", () => {
  it.each([
    [{ status: 429, code: "over_request_rate_limit" }, "rateLimited"],
    [{ status: 429 }, "rateLimited"],
    [{ status: 400, code: "over_email_send_rate_limit" }, "rateLimited"],
    [{ status: 400, code: "email_not_confirmed" }, "emailNotConfirmed"],
    [{ status: 400, code: "invalid_credentials" }, "wrongCredentials"],
    [{ name: "AuthRetryableFetchError", status: 502 }, "network"],
    [{ status: 0 }, "network"],
    [{ status: 500, code: "unexpected_failure" }, "unexpected"],
    [{}, "unexpected"],
  ] as const)("%j → %s", (error, key) => {
    expect(authErrorKey(error)).toBe(key);
  });

  it("uses the generic wrong-credentials message", () => {
    expect(authErrorMessage({ code: "invalid_credentials" })).toBe(AUTH_MESSAGES.wrongCredentials);
    expect(AUTH_MESSAGES.wrongCredentials).toBe("Email or password is incorrect.");
  });
});
