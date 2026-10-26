import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("UI gallery (development)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
    await expect(page.getByRole("heading", { level: 1, name: "UI gallery" })).toBeVisible();
  });

  for (const width of [375, 1280]) {
    test(`has no serious accessibility issues at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
    });
  }

  test("primary button works by click and keyboard; disabled button stays focusable and inert", async ({ page }) => {
    const primary = page.getByRole("button", { name: "Primary" }).first();
    await primary.click();
    await expect(page.getByTestId("click-count")).toHaveText("Primary clicks: 1");
    await primary.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("click-count")).toHaveText("Primary clicks: 2");

    const disabled = page.getByRole("button", { name: "Disabled" });
    await expect(disabled).toHaveAttribute("aria-disabled", "true");
    await disabled.focus();
    await expect(disabled).toBeFocused();
    await disabled.click({ force: true });
    await expect(page.getByTestId("click-count")).toHaveText("Primary clicks: 2");
  });

  test("focused controls show a visible focus outline", async ({ page }) => {
    const primary = page.getByRole("button", { name: "Primary" }).first();
    await primary.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    const outline = await primary.evaluate((el) => {
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle };
    });
    expect(outline.style).toBe("solid");
    expect(outline.width).toBe("2px");
  });

  test("loading button keeps its width and is marked busy", async ({ page }) => {
    const loading = page.getByRole("button", { name: /Loading/ });
    await expect(loading).toHaveAttribute("aria-busy", "true");
    await expect(loading).toHaveAttribute("aria-disabled", "true");
  });

  test("small and medium buttons have a 44px hit area, with or without a border", async ({ page }) => {
    for (const name of ["Small 32", "Medium 40", "Small secondary", "Medium secondary"]) {
      const button = page.getByRole("button", { name });
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      if (!box) throw new Error(`${name} not rendered`);
      const hit = await page.evaluate(
        ({ x, top, bottom }) => [document.elementFromPoint(x, top)?.closest("button")?.textContent, document.elementFromPoint(x, bottom)?.closest("button")?.textContent],
        { x: box.x + box.width / 2, top: box.y + box.height / 2 - 21.5, bottom: box.y + box.height / 2 + 21.5 },
      );
      expect(hit).toEqual([name, name]);
    }
  });

  test("text fields link their label, helper and error", async ({ page }) => {
    const field = page.getByLabel("Title with error");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAccessibleDescription("Use at least 5 characters.");
    await expect(page.getByLabel("Title (required)", { exact: true })).toHaveAccessibleDescription("5 to 80 characters.");
  });

  test("textarea counts characters", async ({ page }) => {
    const description = page.getByLabel("Description");
    await description.fill("Hello");
    await expect(page.getByText("5 / 2000")).toBeVisible();
  });

  test("segmented control is a radio group operable with arrow keys", async ({ page }) => {
    const group = page.getByRole("group", { name: "Condition (required)" });
    await group.getByRole("radio", { name: "Good" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(group.getByRole("radio", { name: "Fair" })).toBeChecked();
    await expect(page.getByTestId("condition-value")).toHaveText("Selected: fair");
  });

  test("photo tiles expose progress, errors and named remove buttons", async ({ page }) => {
    await expect(page.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "60");
    await expect(page.getByRole("alert").filter({ hasText: "Please use a JPEG, PNG or WebP photo." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove photo: Sample photo, cover" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add photo" })).toBeVisible();
  });
});
