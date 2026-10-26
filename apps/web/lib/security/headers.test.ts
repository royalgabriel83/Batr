import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, FIXED_SECURITY_HEADERS, newNonce } from "./headers";

describe("contentSecurityPolicy", () => {
  it("allows scripts only with the nonce and blocks framing", () => {
    const csp = contentSecurityPolicy("abc", "https://xyz.supabase.co", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' blob: data: https://xyz.supabase.co");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows eval only in development and doesn't upgrade a local http Supabase", () => {
    const csp = contentSecurityPolicy("abc", "http://127.0.0.1:54321", true);
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("img-src 'self' blob: data: http://127.0.0.1:54321");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});

describe("security headers", () => {
  it("sets nosniff, HSTS and no framing on every response", () => {
    const keys = FIXED_SECURITY_HEADERS.map((header) => header.key);
    expect(keys).toEqual(expect.arrayContaining(["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"]));
  });

  it("makes a different nonce each time", () => {
    expect(newNonce()).not.toBe(newNonce());
  });
});
