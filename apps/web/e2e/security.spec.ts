import { expect, test } from "@playwright/test";

// Security headers on pages and static files (BATR review, roadmap P0 #2).

test("pages send a nonce policy and the fixed security headers", async ({ page }) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  const response = await page.goto("/explore");
  const headers = response?.headers() ?? {};
  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(csp).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["strict-transport-security"]).toContain("max-age=");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  // Next.js scripts carry the nonce, so the page still works.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(violations).toEqual([]);

  // A second request gets a different nonce.
  const again = (await page.request.get("/explore")).headers()["content-security-policy"];
  expect(again).not.toBe(csp);
});

test("static files get the fixed headers too", async ({ request }) => {
  const response = await request.get("/favicon.ico");
  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
});
