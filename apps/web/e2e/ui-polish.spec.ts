import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { newAccount, signUpAndConfirm } from "./support/auth";
import { jpegPhoto } from "./support/offers";

// Front-end polish (owner, 2026-10-20): the carousel, the exchange
// builder, the account menu, the phone tab bar and save toasts,
// against the real API and local Supabase.

async function axeBlocking(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

/** Publishes an offer with three photos through the API with the member's cookie session. */
async function publishWithPhotos(request: APIRequestContext, baseURL: string, title: string): Promise<string> {
  const headers = () => ({ "Idempotency-Key": randomUUID(), Origin: baseURL });
  const fields = { title, category: "electronics", condition: "good", offering_text: `${title}, boxed`, wants_text: "A laptop", description: "" };
  const created = await request.post("/api/v1/offers", { headers: headers(), data: fields });
  expect(created.status()).toBe(201);
  let offer = ((await created.json()) as { data: { id: string; status: string; revision: number } }).data;
  for (const color of [
    { r: 30, g: 30, b: 30 },
    { r: 200, g: 60, b: 20 },
    { r: 20, g: 60, b: 160 },
  ]) {
    const photo = await jpegPhoto("photo.jpg", color);
    const uploaded = await request.post(`/api/v1/offers/${offer.id}/photos`, {
      headers: headers(),
      multipart: { file: { name: photo.name, mimeType: photo.mimeType, buffer: photo.buffer }, expected_status: offer.status, expected_revision: String(offer.revision) },
    });
    expect(uploaded.status()).toBe(201);
    offer = ((await uploaded.json()) as { data: typeof offer }).data;
  }
  const published = await request.post(`/api/v1/offers/${offer.id}/publish`, { headers: headers(), data: { expected_status: offer.status, expected_revision: offer.revision } });
  expect(published.status()).toBe(200);
  return offer.id;
}

test.describe("front-end polish", () => {
  test("offer photos: dots, pause, keys and swipe-free selection; a visitor saves with a toast", async ({ page, browser, baseURL }) => {
    test.slow();
    await signUpAndConfirm(page, newAccount("carousel"));
    const title = `Camera ${randomUUID().slice(0, 6)}`;
    const id = await publishWithPhotos(page.request, baseURL as string, title);

    const member = await (await browser.newContext({ baseURL })).newPage();
    await signUpAndConfirm(member, newAccount("saver"));
    await member.goto(`/offers/${id}`);
    const photos = member.getByRole("region", { name: `Photos of ${title}` });
    const dot = (n: number) => photos.getByRole("button", { name: `Photo ${String(n)} of 3`, exact: true });
    await expect(dot(1)).toHaveAttribute("aria-current", "true");

    // Pausing names the action that will follow.
    await photos.getByRole("button", { name: `Pause photos of ${title.toLowerCase()}` }).click();
    await expect(photos.getByRole("button", { name: `Play photos of ${title.toLowerCase()}` })).toBeVisible();

    await dot(2).click();
    await expect(dot(2)).toHaveAttribute("aria-current", "true");
    await expect(photos.getByRole("group", { name: "Photo 2 of 3" })).not.toHaveAttribute("inert");
    await expect(photos.getByRole("group", { name: "Photo 1 of 3", includeHidden: true })).toHaveAttribute("inert", "");
    await member.keyboard.press("ArrowRight");
    await expect(dot(3)).toHaveAttribute("aria-current", "true");
    expect(await axeBlocking(member)).toEqual([]);

    // Saving confirms with a toast that leads to the list.
    await member.getByRole("button", { name: `Save ${title}` }).click();
    const toast = member.getByRole("status").filter({ hasText: "Saved" });
    await expect(toast).toBeVisible();
    await toast.getByRole("link", { name: "View saved" }).click();
    await expect(member).toHaveURL(/\/saved$/);
    await expect(member.getByText(title).first()).toBeVisible();
  });

  test("reduced motion: carousels never move on their own and show no pause button", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    const steps = page.getByRole("region", { name: "Steps" });
    await expect(steps.getByRole("button", { name: "Step 1 of 3", exact: true })).toHaveAttribute("aria-current", "true");
    await expect(steps.getByRole("button", { name: /^(Pause|Play) / })).toHaveCount(0);
    await page.waitForTimeout(5600);
    await expect(steps.getByRole("button", { name: "Step 1 of 3", exact: true })).toHaveAttribute("aria-current", "true");
    await steps.getByRole("button", { name: "Step 3 of 3", exact: true }).click();
    await expect(steps.getByRole("group", { name: "Step 3 of 3" })).toContainText("Exchanges come next");
  });

  test("the exchange builder joins the two sides once both are filled", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("builder"));
    await page.goto("/offers/new");
    const builder = page.getByRole("region", { name: "Your exchange" });
    await expect(builder).toContainText("Fill in both sides to complete your exchange.");
    await page.getByLabel("What you're offering").fill("A Canon camera");
    await expect(builder).toContainText("A Canon camera");
    await expect(builder).toContainText("Fill in both sides");
    await page.getByLabel("What you'd like in return").fill("A laptop");
    await expect(builder).toContainText("Both sides are in place.");
  });

  test("account menu: keyboard, choices and signing out", async ({ page }) => {
    const account = newAccount("menu");
    await signUpAndConfirm(page, account);
    await page.goto("/explore");
    const trigger = page.getByRole("banner").getByRole("button", { name: /your account/ });
    await trigger.focus();
    await page.keyboard.press("ArrowDown");
    const menu = page.getByRole("menu", { name: "Your account" });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Your account" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "My offers" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await axeBlocking(page)).toEqual([]);

    await trigger.click();
    await menu.getByRole("menuitem", { name: "Saved" }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(menu).toBeHidden();

    await trigger.click();
    await menu.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
  });

  test("phones navigate with a labelled tab bar, hidden on the offer form and on wide screens", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("tabs"));
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    const tabs = page.getByRole("navigation", { name: "Primary" });
    await expect(tabs).toBeVisible();
    await expect(tabs.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    await tabs.getByRole("link", { name: "Explore" }).click();
    await expect(page).toHaveURL(/\/explore$/);
    await expect(tabs.getByRole("link", { name: "Explore" })).toHaveAttribute("aria-current", "page");
    expect(await axeBlocking(page)).toEqual([]);

    await tabs.getByRole("link", { name: "Create offer" }).click();
    await expect(page).toHaveURL(/\/offers\/new$/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/explore");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeHidden();
  });
});
