import { describe, expect, it } from "vitest";
import {
  AUTH_LIMITS,
  DisplayNameInputSchema,
  DisplayNameSchema,
  NewPasswordInputSchema,
  NewPasswordSchema,
  PasswordResetRequestSchema,
  SignInInputSchema,
  SignUpInputSchema,
  checkAuthInput,
} from "./schemas.ts";

const valid = { email: "  ada@example.com ", password: "correct horse", display_name: "  Ada L " };

describe("sign-up input", () => {
  it("accepts valid input and trims email and display name, not the password", () => {
    expect(checkAuthInput(SignUpInputSchema, { ...valid, password: " ten chars " })).toEqual({
      ok: true,
      data: { email: "ada@example.com", password: " ten chars ", display_name: "Ada L" },
    });
  });

  it("reports one message per failing field", () => {
    const result = checkAuthInput(SignUpInputSchema, { email: "ada", password: "short", display_name: "A" });
    expect(result).toEqual({
      ok: false,
      errors: {
        email: "Enter an email address like name@example.com.",
        password: "Use at least 10 characters.",
        display_name: "Use at least 2 characters.",
      },
    });
  });

  it("asks for an email when it is blank", () => {
    const result = checkAuthInput(SignUpInputSchema, { ...valid, email: "   " });
    expect(result.ok ? null : result.errors.email).toBe("Enter your email address.");
  });

  it("refuses unknown fields", () => {
    expect(SignUpInputSchema.safeParse({ ...valid, role: "admin" }).success).toBe(false);
  });
});

describe("password", () => {
  it("needs at least 10 characters", () => {
    expect(NewPasswordSchema.safeParse("a".repeat(AUTH_LIMITS.passwordMin - 1)).success).toBe(false);
    expect(NewPasswordSchema.safeParse("a".repeat(AUTH_LIMITS.passwordMin)).success).toBe(true);
  });

  it("refuses passwords over 72 bytes, counting multi-byte characters", () => {
    expect(NewPasswordSchema.safeParse("a".repeat(72)).success).toBe(true);
    expect(NewPasswordSchema.safeParse("a".repeat(73)).success).toBe(false);
    expect(NewPasswordSchema.safeParse("é".repeat(36)).success).toBe(true);
    expect(NewPasswordSchema.safeParse("é".repeat(37)).success).toBe(false);
    expect(NewPasswordSchema.safeParse("€".repeat(24)).success).toBe(true);
    expect(NewPasswordSchema.safeParse("€".repeat(25)).success).toBe(false);
    expect(NewPasswordSchema.safeParse("🙂".repeat(18)).success).toBe(true);
    expect(NewPasswordSchema.safeParse("🙂".repeat(19)).success).toBe(false);
  });
});

describe("display name", () => {
  it.each([
    ["Ab", true],
    ["a".repeat(40), true],
    ["a".repeat(41), false],
    ["A", false],
    ["   A   ", false],
    ["🙂🙂", true],
    ["🙂".repeat(40), true],
    ["Mary.Ann", true],
    ["J. R. Smith", true],
    ["bob.com", false],
    ["Visit Bob.COM now", false],
    ["https://x", false],
    ["ftp://x", false],
    ["www.bob", false],
    ["shop at bob.shop/now", false],
    ["Bob.company", true],
  ])("%j valid: %s", (name, ok) => {
    expect(DisplayNameSchema.safeParse(name).success).toBe(ok);
  });

  it("explains a link", () => {
    expect(checkAuthInput(DisplayNameInputSchema, { display_name: "bob.com" })).toEqual({
      ok: false,
      errors: { display_name: "Display names can't include links." },
    });
  });

  it("explains a long name", () => {
    const result = checkAuthInput(DisplayNameInputSchema, { display_name: "a".repeat(41) });
    expect(result.ok ? null : result.errors.display_name).toBe("Use 40 characters or fewer.");
  });
});

describe("sign-in input", () => {
  it("checks only that fields are filled", () => {
    expect(checkAuthInput(SignInInputSchema, { email: "ada@example.com", password: "x" }).ok).toBe(true);
    expect(checkAuthInput(SignInInputSchema, { email: "ada@example.com", password: "" })).toEqual({
      ok: false,
      errors: { password: "Enter your password." },
    });
  });
});

describe("password reset input", () => {
  it("asks only for a valid email, trimmed", () => {
    expect(checkAuthInput(PasswordResetRequestSchema, { email: " ada@example.com " })).toEqual({
      ok: true,
      data: { email: "ada@example.com" },
    });
    expect(checkAuthInput(PasswordResetRequestSchema, { email: "" })).toEqual({
      ok: false,
      errors: { email: "Enter your email address." },
    });
    expect(PasswordResetRequestSchema.safeParse({ email: "ada@example.com", password: "x" }).success).toBe(false);
  });

  it("holds a new password to the sign-up rule", () => {
    expect(checkAuthInput(NewPasswordInputSchema, { password: "a".repeat(AUTH_LIMITS.passwordMin) }).ok).toBe(true);
    expect(checkAuthInput(NewPasswordInputSchema, { password: "a".repeat(AUTH_LIMITS.passwordMin - 1) })).toEqual({
      ok: false,
      errors: { password: `Use at least ${String(AUTH_LIMITS.passwordMin)} characters.` },
    });
    expect(checkAuthInput(NewPasswordInputSchema, { password: "é".repeat(37) }).ok).toBe(false);
  });
});
