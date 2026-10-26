import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PHOTO_MESSAGES, PUBLISH_RULE_MESSAGES } from "@batr/shared";
import { newAccount, signUpAndConfirm } from "./support/auth";
import { addPhotos, heicFile, jpegPhoto, savedPhotos } from "./support/offers";

// Unit 07 review: on small screens the offer form is shown in steps
// (02-offer-creation.md, Design and UI states: "stepped on small
// screens"); on wider screens it stays one page.

const stepStatus = (page: Page) => page.locator("#step-status");
const next = (page: Page) => page.getByRole("button", { name: "Next" });

async function axeBlocking(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test.describe("offer form on a phone (375px)", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("three steps, then the preview; values, photo order and saved drafts carry across", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("steps"));
    await page.goto("/offers/new");
    await expect(stepStatus(page)).toHaveText("Step 1 of 3: Photos");
    await expect(page.getByLabel("Title")).toBeHidden();
    await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
    expect(await axeBlocking(page)).toEqual([]);

    await addPhotos(page, [await jpegPhoto("first.jpg", { r: 200, g: 40, b: 40 }), await jpegPhoto("second.jpg", { r: 40, g: 40, b: 200 })]);
    await expect(savedPhotos(page)).toHaveCount(2);
    const photoIds = () => savedPhotos(page).evaluateAll((items) => items.map((item) => item.getAttribute("data-photo-id")));
    const order = (await photoIds()).reverse();
    await page.getByRole("button", { name: "Move Photo 2 earlier" }).click();
    await expect.poll(photoIds).toEqual(order);

    await next(page).click();
    await expect(stepStatus(page)).toHaveText("Step 2 of 3: Details");
    await expect(stepStatus(page)).toBeFocused();
    await expect(page.locator("#photos-add")).toBeHidden();
    await page.getByLabel("Title").fill("Folding bike");
    await page.getByLabel("Category").selectOption({ label: "Sports and outdoors" });
    await page.locator('label[for="condition-good"]').click();
    await expect(page.getByText("Unsaved changes")).toBeVisible();
    expect(await axeBlocking(page)).toEqual([]);

    // Moving on saves the draft.
    await next(page).click();
    await expect(stepStatus(page)).toHaveText("Step 3 of 3: Exchange terms");
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.getByLabel("What you're offering").fill("A folding bike, serviced");
    await page.getByLabel("What you'd like in return").fill("A road bike");

    await page.getByRole("button", { name: "Back" }).click();
    await expect(stepStatus(page)).toHaveText("Step 2 of 3: Details");
    await expect(page.getByLabel("Title")).toHaveValue("Folding bike");
    await page.getByRole("button", { name: "Back" }).click();
    expect(await photoIds()).toEqual(order);

    await next(page).click();
    await next(page).click();
    await expect(page.getByLabel("What you'd like in return")).toHaveValue("A road bike");
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("heading", { name: "Preview", level: 2 })).toBeFocused();
    await expect(page.getByRole("heading", { name: "Folding bike" })).toBeVisible();
    expect(await axeBlocking(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

    await page.getByRole("button", { name: "Publish offer" }).click();
    await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();
  });

  test("a long photo error is shown in full under its tile, not cut off inside it", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("steptile"));
    await page.goto("/offers/new");
    await addPhotos(page, [heicFile()]);
    const tile = page.locator("[data-pending-photo]");
    await expect(tile.getByText("Not added")).toBeVisible();
    const message = tile.getByText(PHOTO_MESSAGES.heic);
    await expect(message).toBeVisible();
    expect(await message.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true);
  });

  test("Next waits while the first photo uploads", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("stepwait"));
    await page.goto("/offers/new");
    await page.route("**/api/v1/offers/*/photos", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await addPhotos(page, [await jpegPhoto()]);
    await expect(next(page)).toHaveAttribute("aria-disabled", "true");
    await expect(savedPhotos(page)).toHaveCount(1);
    await expect(next(page)).not.toHaveAttribute("aria-disabled", "true");
  });

  test("publishing with missing details goes back to the step with the first problem", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("steperr"));
    await page.goto("/offers/new");
    await addPhotos(page, [await jpegPhoto()]);
    await expect(savedPhotos(page)).toHaveCount(1);
    await next(page).click();
    await page.getByLabel("Title").fill("Umbrella");
    await next(page).click();
    await page.getByRole("button", { name: "Preview" }).click();
    await page.getByRole("button", { name: "Publish offer" }).click();

    await expect(stepStatus(page)).toHaveText("Step 2 of 3: Details");
    await expect(page.getByText(PUBLISH_RULE_MESSAGES.category)).toBeVisible();
    await expect(page.getByLabel("Category")).toBeFocused();
  });

  test("the steps can be completed with the keyboard alone", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("stepkeys"));
    await page.goto("/offers/new");
    const chooser = page.waitForEvent("filechooser");
    await page.locator("#photos-add").focus();
    await page.keyboard.press("Enter");
    await (await chooser).setFiles([await jpegPhoto()]);
    await expect(savedPhotos(page)).toHaveCount(1);

    await next(page).focus();
    await page.keyboard.press("Enter");
    await expect(stepStatus(page)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Title")).toBeFocused();
    await page.keyboard.type("Chess set");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await next(page).focus();
    await page.keyboard.press("Enter");
    await expect(stepStatus(page)).toHaveText("Step 3 of 3: Exchange terms");
    await page.keyboard.press("Tab");
    await page.keyboard.type("A wooden chess set");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Open to offers");
    await page.getByRole("button", { name: "Preview" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Publish offer" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();
  });
});

test("on a wide screen the form stays one page with no steps", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await signUpAndConfirm(page, newAccount("nosteps"));
  await page.goto("/offers/new");
  await expect(stepStatus(page)).toBeHidden();
  await expect(next(page)).toHaveCount(0);
  await expect(page.locator("#photos-add")).toBeVisible();
  await expect(page.getByLabel("Title")).toBeVisible();
  await expect(page.getByLabel("What you'd like in return")).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish offer" })).toBeVisible();
});
