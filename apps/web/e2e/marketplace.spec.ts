import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { OFFER_CATEGORIES, type OfferCategory } from "@batr/shared";
import { newAccount, signUpAndConfirm } from "./support/auth";
import { addPhotos, completeOffer, fillOffer, jpegPhoto, myOfferRow, offerIdFrom, publishOffer, savedPhotos } from "./support/offers";

// Unit 08: the marketplace and the offer page (milestone-1.md, Main
// journey and acceptance criteria 5, 8, 14, 15, 17; 01-marketplace-
// discovery.md), against the real API and local Supabase.

async function axeBlocking(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

const card = (page: Page, title: string) => page.getByRole("list", { name: "Offers" }).getByRole("link").filter({ hasText: title });

/** A signed-out visitor in a separate browser context. */
async function visitor(browser: Browser, baseURL: string): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  return context.newPage();
}

/** Creates, fills, adds a photo to and publishes an offer through the API with the member's cookie session. */
async function publishViaApi(request: APIRequestContext, baseURL: string, title: string, category: OfferCategory): Promise<string> {
  const headers = () => ({ "Idempotency-Key": randomUUID(), Origin: baseURL });
  const fields = { title, category, condition: "good", offering_text: `${title}, boxed`, wants_text: "Anything useful", description: "" };
  const created = await request.post("/api/v1/offers", { headers: headers(), data: fields });
  expect(created.status()).toBe(201);
  let offer = ((await created.json()) as { data: { id: string; status: string; revision: number } }).data;
  const photo = await jpegPhoto();
  const uploaded = await request.post(`/api/v1/offers/${offer.id}/photos`, {
    headers: headers(),
    multipart: { file: { name: photo.name, mimeType: photo.mimeType, buffer: photo.buffer }, expected_status: offer.status, expected_revision: String(offer.revision) },
  });
  expect(uploaded.status()).toBe(201);
  offer = ((await uploaded.json()) as { data: typeof offer }).data;
  const published = await request.post(`/api/v1/offers/${offer.id}/publish`, {
    headers: headers(),
    data: { expected_status: offer.status, expected_revision: offer.revision },
  });
  expect(published.status()).toBe(200);
  return offer.id;
}

test.describe("marketplace and offer page", () => {
  test("main journey: publish, a signed-out visitor finds and opens it, sees edits, and loses it on pause and close", async ({ page, browser, baseURL }) => {
    test.slow();
    const title = `Tandem bike ${randomUUID().slice(0, 6)}`;
    await signUpAndConfirm(page, newAccount("journey"));
    await page.goto("/offers/new");
    await fillOffer(page, completeOffer(title));
    await addPhotos(page, [await jpegPhoto("front.jpg"), await jpegPhoto("side.jpg", { r: 200, g: 40, b: 40 })]);
    await expect(savedPhotos(page)).toHaveCount(2);
    const id = await offerIdFrom(page);
    await page.getByRole("button", { name: "Publish offer" }).click();
    await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();

    // A signed-out visitor finds it in the marketplace within one page load and opens it.
    const guest = await visitor(browser, baseURL as string);
    await guest.goto("/");
    await guest.getByRole("banner").getByRole("link", { name: "Explore" }).click();
    await expect(guest.getByRole("heading", { name: "Explore", level: 1 })).toBeVisible();
    // Narrowed to its category, so offers other tests publish at the same moment can't push it to page 2.
    await guest.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: OFFER_CATEGORIES.sports_outdoors }).click();
    await card(guest, title).click();
    await expect(guest).toHaveURL(new RegExp(`/offers/${id}$`));
    await expect(guest.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(guest.getByText("A two-person tent")).toBeVisible();
    await expect(guest.getByText(/^Member since /)).toBeVisible();
    // The photo carousel's dots, at every screen size.
    await expect(guest.getByRole("button", { name: "Photo 2 of 2", exact: true })).toBeVisible();
    await expect(guest.getByRole("link", { name: "Edit offer" })).toHaveCount(0);
    await expect(guest.getByRole("button", { name: /Propose/ })).toHaveCount(0);

    // The owner edits the title; the visitor sees it on the next load.
    await page.goto(`/offers/${id}/edit`);
    await page.getByLabel("Title").fill(`${title} for two`);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();
    await guest.reload();
    await expect(guest.getByRole("heading", { name: `${title} for two`, level: 1 })).toBeVisible();

    // Paused: not available to the visitor, and gone from the marketplace.
    await page.goto("/my-offers");
    const row = myOfferRow(page, `${title} for two`);
    await row.getByRole("button", { name: `Pause ${title} for two` }).click();
    await expect(row.getByText("Paused", { exact: true })).toBeVisible();
    await guest.reload();
    await expect(guest.getByRole("heading", { name: "This offer isn't available" })).toBeVisible();
    await guest.goto("/explore?category=sports_outdoors");
    await expect(card(guest, title)).toHaveCount(0);

    // Resumed: back. Closed: hidden for good.
    await row.getByRole("button", { name: `Resume ${title} for two` }).click();
    await expect(row.getByText("Active", { exact: true })).toBeVisible();
    await guest.reload();
    await expect(card(guest, title)).toHaveCount(1);
    await row.getByRole("button", { name: `Close ${title} for two` }).click();
    await page.getByRole("dialog", { name: "Close this offer?" }).getByRole("button", { name: "Close offer" }).click();
    await expect(row.getByText("Closed", { exact: true })).toBeVisible();
    await guest.reload();
    await expect(card(guest, title)).toHaveCount(0);
    await guest.goto(`/offers/${id}`);
    await expect(guest.getByRole("heading", { name: "This offer isn't available" })).toBeVisible();
    await guest.context().close();
  });

  test("the success screen links to the offer page and shares its link", async ({ page }) => {
    await page.addInitScript(() => {
      // A browser without a share sheet: the link is copied instead.
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: (text: string) => ((window as unknown as { copied: string }).copied = text, Promise.resolve()) },
        configurable: true,
      });
    });
    await signUpAndConfirm(page, newAccount("success"));
    const id = await publishOffer(page, "Kayak paddle");
    await page.getByRole("button", { name: "Share" }).click();
    await expect(page.getByText("Link copied")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { copied: string }).copied)).toMatch(new RegExp(`/offers/${id}$`));
    await page.getByRole("link", { name: "View offer" }).click();
    await expect(page).toHaveURL(new RegExp(`/offers/${id}$`));
    await expect(page.getByRole("heading", { name: "Kayak paddle", level: 1 })).toBeVisible();
    // The owner's own offer: Edit instead of any other action.
    await expect(page.getByRole("region", { name: "Your offer" }).getByText("Active", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Edit offer" })).toBeVisible();
  });

  test("a draft opens only for its owner; another member and visitors get not available", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("draftpage"));
    await page.goto("/offers/new");
    await fillOffer(page, { title: "Secret draft" });
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    const id = await offerIdFrom(page);

    await page.goto(`/offers/${id}`);
    await expect(page.getByRole("heading", { name: "Secret draft", level: 1 })).toBeVisible();
    await expect(page.getByText("Only you can see it while it isn't active.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);

    const other = await visitor(browser, baseURL as string);
    await signUpAndConfirm(other, newAccount("draftother"));
    for (const viewer of [other, await visitor(browser, baseURL as string)]) {
      const response = await viewer.goto(`/offers/${id}`);
      expect(response?.status()).toBe(404);
      await expect(viewer.getByRole("heading", { name: "This offer isn't available" })).toBeVisible();
      await expect(viewer.getByText("Secret draft")).toHaveCount(0);
      await viewer.context().close();
    }
  });

  test("members are shown with a neutral initial beside their name, never a person icon", async ({ page, browser, baseURL }) => {
    const account = newAccount("initials");
    await signUpAndConfirm(page, account);
    const title = `Lamp ${randomUUID().slice(0, 6)}`;
    const id = await publishViaApi(page.request, baseURL as string, title, "home_garden");
    // The decorative initial of "initials …" and no icon next to the name.
    const initial = (scope: ReturnType<Page["locator"]>) => scope.locator('span[aria-hidden="true"]', { hasText: /^I$/ });

    const accountLink = page.getByRole("banner").getByRole("button", { name: /your account/ });
    await expect(accountLink).toContainText(account.displayName);
    await expect(initial(accountLink)).toHaveCount(1);
    await expect(accountLink.locator("svg")).toHaveCount(0);

    const guest = await visitor(browser, baseURL as string);
    await guest.goto("/explore?category=home_garden");
    const owner = card(guest, title).locator("p").filter({ hasText: account.displayName });
    await expect(initial(owner)).toHaveCount(1);
    await expect(owner.locator("svg")).toHaveCount(0);

    await guest.goto(`/offers/${id}`);
    // The innermost section holding "Member since" (the owner block).
    const ownerBlock = guest.locator("section").filter({ hasText: /Member since/ }).last();
    await expect(initial(ownerBlock)).toHaveCount(1);
    await expect(ownerBlock.locator("svg")).toHaveCount(0);
    await guest.context().close();
  });

  test("the category filter narrows the list and can be cleared in one step", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("category"));
    const title = `Board game ${randomUUID().slice(0, 6)}`;
    await publishViaApi(page.request, baseURL as string, title, "books_media");

    const guest = await visitor(browser, baseURL as string);
    await guest.goto("/explore");
    const chips = guest.getByRole("navigation", { name: "Categories" });
    await expect(chips.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    await chips.getByRole("link", { name: OFFER_CATEGORIES.books_media }).click();
    await expect(guest).toHaveURL(/\/explore\?category=books_media$/);
    await expect(chips.getByRole("link", { name: OFFER_CATEGORIES.books_media })).toHaveAttribute("aria-current", "page");
    await expect(card(guest, title)).toHaveCount(1);

    await chips.getByRole("link", { name: OFFER_CATEGORIES.electronics }).click();
    await expect(guest).toHaveURL(/category=electronics$/);
    await expect(card(guest, title)).toHaveCount(0);

    await chips.getByRole("link", { name: "All" }).click();
    await expect(guest).toHaveURL(/\/explore$/);
    await expect(card(guest, title)).toHaveCount(1);
    await guest.context().close();
  });

  test("Load more adds the next 20 without repeating any offer and moves focus to the first new one", async ({ page, browser, baseURL }) => {
    test.slow();
    await signUpAndConfirm(page, newAccount("paging"));
    const batch = randomUUID().slice(0, 6);
    const titles = Array.from({ length: 21 }, (_, i) => `Picture book ${batch} ${String(i + 1).padStart(2, "0")}`);
    for (const title of titles) await publishViaApi(page.request, baseURL as string, title, "baby_kids");

    const guest = await visitor(browser, baseURL as string);
    await guest.goto("/explore?category=baby_kids");
    const links = guest.getByRole("list", { name: "Offers" }).getByRole("link");
    await expect(links).toHaveCount(20);
    // Newest first: the last one published leads.
    await expect(links.first()).toContainText(titles[20] as string);
    await guest.getByRole("button", { name: "Load more" }).click();
    await expect.poll(() => links.count()).toBeGreaterThan(20);
    await expect(links.nth(20)).toBeFocused();
    const hrefs = await links.evaluateAll((all) => all.map((a) => a.getAttribute("href")));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const title of titles) await expect(card(guest, title)).toHaveCount(1);
    await guest.context().close();
  });

  test("a photo that fails to load shows a placeholder; the offer page fetches fresh links once and shows the photo", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("photofail"));
    const title = `Desk lamp ${randomUUID().slice(0, 6)}`;
    const id = await publishViaApi(page.request, baseURL as string, title, "home_garden");

    const guest = await visitor(browser, baseURL as string);
    // Every signed photo link fails in the marketplace: the card keeps its text and shows a placeholder.
    await guest.route("**/storage/v1/object/sign/**", (route) => route.abort());
    await guest.goto("/explore?category=home_garden");
    await expect(card(guest, title)).toBeVisible();
    await expect(card(guest, title).locator("img")).toHaveCount(0);

    // On the offer page the links keep failing (as expired links would) until
    // the page asks for fresh ones; then the photo shows.
    await guest.unroute("**/storage/v1/object/sign/**");
    let refreshedLinks = false;
    guest.on("request", (request) => {
      if (request.url().endsWith(`/api/v1/offers/${id}/photo-urls`)) refreshedLinks = true;
    });
    await guest.route("**/storage/v1/object/sign/**", (route) => (refreshedLinks ? route.continue() : route.abort()));
    const refreshed = guest.waitForResponse((response) => response.url().endsWith(`/api/v1/offers/${id}/photo-urls`));
    await guest.goto(`/offers/${id}`);
    expect((await refreshed).status()).toBe(200);
    await expect(guest.locator("article img").first()).toBeVisible();
    await guest.context().close();
  });

  test("marketplace cards reach every column count and can be opened with the keyboard", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("grid"));
    for (let i = 0; i < 4; i++) await publishViaApi(page.request, baseURL as string, `Grid item ${String(i)}`, "other");
    const guest = await visitor(browser, baseURL as string);
    const columns = () =>
      guest
        .getByRole("list", { name: "Offers" })
        .getByRole("listitem")
        .evaluateAll((items) => new Set(items.slice(0, 8).map((item) => Math.round(item.getBoundingClientRect().left))).size);
    for (const [width, expected] of [
      [375, 1],
      [640, 2],
      [768, 3],
      [1024, 4],
    ] as const) {
      await guest.setViewportSize({ width, height: 900 });
      await guest.goto("/explore?category=other");
      await expect(guest.getByRole("list", { name: "Offers" }).getByRole("listitem").nth(3)).toBeVisible();
      expect(await columns(), `${String(width)}px`).toBe(expected);
    }

    // Keyboard: tab past the category chips to the first card and open it.
    await guest.goto("/explore?category=other");
    await guest.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: OFFER_CATEGORIES.other, exact: true }).focus();
    const first = guest.getByRole("list", { name: "Offers" }).getByRole("link").first();
    for (let i = 0; i < 10 && !(await first.evaluate((el) => el === document.activeElement)); i++) await guest.keyboard.press("Tab");
    await expect(first).toBeFocused();
    await guest.keyboard.press("Enter");
    await expect(guest).toHaveURL(/\/offers\/[0-9a-f-]{36}$/);
    await guest.context().close();
  });

  for (const width of [375, 1280]) {
    test(`Explore and the offer page work at ${String(width)}px with no serious accessibility issues`, async ({ page, browser, baseURL }) => {
      await signUpAndConfirm(page, newAccount(`a11y${String(width)}`));
      const id = await publishViaApi(page.request, baseURL as string, `Long title that keeps going to test wrapping in cards ${String(width)}`, "sports_outdoors");
      const guest = await visitor(browser, baseURL as string);
      await guest.setViewportSize({ width, height: 900 });
      for (const path of ["/explore", `/offers/${id}`]) {
        const response = await guest.goto(path);
        expect(response?.headers()["cache-control"], path).toContain("no-store");
        expect(await axeBlocking(guest), path).toEqual([]);
        expect(await guest.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(width);
      }
      await guest.context().close();
    });
  }
});
