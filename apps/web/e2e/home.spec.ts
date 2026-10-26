import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { colors } from "@batr/shared";

test.describe("home page", () => {
  test("renders the header and the BATR logo", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("BATR");
    await expect(page.getByRole("banner").getByRole("link", { name: "BATR home" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Exchange what you have for what you need." })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "How BATR works" })).toBeVisible();
    // The three steps, shown once (the copy for the other screen size is hidden).
    await expect(page.getByRole("region", { name: "How BATR works" }).getByRole("listitem")).toHaveCount(3);
    await expect(page.getByRole("heading", { level: 2, name: "Newest offers" })).toBeVisible();
    // The ink logo sits in the white footer, unaltered (owner, 2026-10-17).
    await expect(page.getByRole("contentinfo").getByRole("img", { name: "BATR home" })).toBeVisible();
  });

  test("describes only what exists, and leads into it", async ({ page }) => {
    await page.goto("/");
    const main = page.getByRole("main");
    await expect(main.getByText("Early version").filter({ visible: true })).toBeVisible();
    await expect(main.getByText("Proposing and agreeing an exchange inside BATR isn't available yet.").filter({ visible: true })).toBeVisible();
    await expect(main.getByRole("heading", { level: 3, name: "Exchanges come next" })).toBeVisible();
    for (const unbuilt of ["Coming soon", "Propose an exchange", "Agree the terms", "agree an exchange with"]) {
      await expect(main.getByText(unbuilt)).toHaveCount(0);
    }
    await main.getByRole("link", { name: "Explore offers" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await page.goBack();
    // Signed out, Create an offer goes to sign-in and comes back afterwards.
    // (The hero's link; an empty marketplace shows a second one.)
    const hero = main.getByRole("region", { name: "Exchange what you have for what you need." });
    await hero.getByRole("link", { name: "Create an offer" }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=%2Foffers%2Fnew/);
  });

  test("loads the stylesheet, design tokens and Inter", async ({ page }) => {
    const failures: string[] = [];
    page.on("requestfailed", (request) => {
      // The router prefetches linked dynamic pages and stops reading once
      // it has what it needs; Chromium reports that as ERR_ABORTED.
      const prefetch = request.headers()["next-router-prefetch"] === "1";
      if (prefetch && request.failure()?.errorText === "net::ERR_ABORTED") return;
      failures.push(request.url());
    });
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });
    await page.goto("/", { waitUntil: "networkidle" });
    const styles = await page.evaluate(async () => {
      await document.fonts.ready;
      return {
        sheets: document.styleSheets.length,
        font: getComputedStyle(document.body).fontFamily,
        interLoaded: [...document.fonts].some((f) => f.family === "Inter" && f.status === "loaded"),
        accent: getComputedStyle(document.documentElement).getPropertyValue("--color-accent-primary").trim(),
        images: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      };
    });
    expect(failures).toEqual([]);
    expect(styles.sheets).toBeGreaterThan(0);
    expect(styles.font).toMatch(/^Inter/);
    expect(styles.interLoaded).toBe(true);
    expect(styles.accent).toBe(colors["accent-primary"]);
    expect(styles.images).toBe(true);
  });

  test("shows the headline and supporting copy in the first mobile screen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");
    // The headline sits close under the header (it used to start below a 112px icon).
    const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
    expect(heading?.y ?? Infinity).toBeLessThanOrEqual(200);
    const intro = page.getByText("is a peer-to-peer exchange marketplace");
    const box = await intro.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(667);
  });

  test("uses a white header with the ink logo, and the dark green hero panel", async ({ page }) => {
    // The approved reference direction (owner, 2026-10-17).
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("img", { name: "BATR home" })).toBeVisible();
    const hero = page.getByRole("region", { name: "Exchange what you have for what you need." });
    // --bg-inverse #021B18
    expect(await hero.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(2, 27, 24)");
    const header = await page.getByRole("banner").evaluate((el) => getComputedStyle(el).backgroundColor);
    // --bg-surface #FFFFFF
    expect(header).toBe("rgb(255, 255, 255)");
  });

  for (const width of [375, 1280]) {
    test(`has no serious accessibility issues at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
    });
  }
});

test("the UI gallery is not available in production", async ({ page }) => {
  const response = await page.goto("/dev/ui");
  expect(response?.status()).toBe(404);
});
