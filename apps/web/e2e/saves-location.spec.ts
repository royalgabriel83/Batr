import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { newAccount, signUpAndConfirm } from "./support/auth";
import { addPhotos, completeOffer, fillOffer, jpegPhoto, offerIdFrom, savedPhotos } from "./support/offers";

// Location phase 1 (general area and logistics) and private likes and
// saves (owner, 2026-10-17), against the real API and local Supabase.

async function axeBlocking(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

async function newPage(browser: Browser, baseURL: string): Promise<Page> {
  return (await browser.newContext({ baseURL })).newPage();
}

/** Publishes an offer through the API with the member's cookie session. */
async function publishViaApi(request: APIRequestContext, baseURL: string, title: string, extra: object = {}): Promise<string> {
  const headers = () => ({ "Idempotency-Key": randomUUID(), Origin: baseURL });
  const fields = { title, category: "other", condition: "good", offering_text: `${title}, boxed`, wants_text: "Anything useful", ...extra };
  const created = await request.post("/api/v1/offers", { headers: headers(), data: fields });
  expect(created.status(), await created.text()).toBe(201);
  let offer = ((await created.json()) as { data: { id: string; status: string; revision: number } }).data;
  const photo = await jpegPhoto();
  const uploaded = await request.post(`/api/v1/offers/${offer.id}/photos`, {
    headers: headers(),
    multipart: { file: { name: photo.name, mimeType: photo.mimeType, buffer: photo.buffer }, expected_status: offer.status, expected_revision: String(offer.revision) },
  });
  offer = ((await uploaded.json()) as { data: typeof offer }).data;
  const published = await request.post(`/api/v1/offers/${offer.id}/publish`, {
    headers: headers(),
    data: { expected_status: offer.status, expected_revision: offer.revision },
  });
  expect(published.status()).toBe(200);
  return offer.id;
}

test.describe("location and logistics", () => {
  test("the owner sets a general area and how the exchange happens; others see only that", async ({ page, browser, baseURL }) => {
    test.slow();
    const title = `Rice cooker ${randomUUID().slice(0, 6)}`;
    await signUpAndConfirm(page, newAccount("area"));
    await page.goto("/offers/new");
    await fillOffer(page, completeOffer(title));
    // The inputs are visually hidden; members click their labels.
    await page.locator('label[for="exchange_mode-in_person"]').click();
    await expect(page.getByRole("radio", { name: "In person", exact: true })).toBeChecked();
    // Remote service doesn't fit an in-person exchange, so it isn't offered.
    await expect(page.getByRole("checkbox", { name: "Remote service" })).toHaveCount(0);
    await page.locator('label[for="handover_methods-collection"]').click();
    await page.locator('label[for="handover_methods-public_meetup"]').click();
    await expect(page.getByRole("checkbox", { name: "Collection" })).toBeChecked();
    await page.getByLabel("General area").selectOption({ label: "Bodija, Ibadan" });
    await addPhotos(page, [await jpegPhoto("front.jpg")]);
    await expect(savedPhotos(page)).toHaveCount(1);
    const id = await offerIdFrom(page);
    await page.getByRole("button", { name: "Publish offer" }).click();
    await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();

    const guest = await newPage(browser, baseURL as string);
    await guest.goto("/explore");
    const card = guest.getByRole("list", { name: "Offers" }).getByRole("listitem").filter({ hasText: title });
    await expect(card.getByText("Bodija, Ibadan")).toBeVisible();
    await guest.goto(`/offers/${id}`);
    const where = guest.getByRole("region", { name: "Where and how" });
    await expect(where.getByText("Bodija, Ibadan")).toBeVisible();
    await expect(where.getByText("In person", { exact: true })).toBeVisible();
    await expect(where.getByText("Collection or Meet in a public place")).toBeVisible();
    await expect(where.getByText("Exact meeting details are agreed privately between members.")).toBeVisible();
  });

  test("an offer without an area shows none, and a remote one shows no location", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("remote"));
    const plain = `Plain lamp ${randomUUID().slice(0, 6)}`;
    const remote = `Logo design ${randomUUID().slice(0, 6)}`;
    const plainId = await publishViaApi(page.request, baseURL as string, plain);
    const remoteId = await publishViaApi(page.request, baseURL as string, remote, {
      // Milestone 9, V6: remote_service is for services, which have their own categories and no condition.
      offer_type: "service",
      category: "design_digital",
      condition: null,
      exchange_mode: "remote",
      handover_methods: ["remote_service"],
    });
    const guest = await newPage(browser, baseURL as string);
    await guest.goto(`/offers/${plainId}`);
    await expect(guest.getByText(/, Ibadan$/)).toHaveCount(0);
    await expect(guest.getByText("Location", { exact: true })).toHaveCount(0);
    await guest.goto(`/offers/${remoteId}`);
    const where = guest.getByRole("region", { name: "Where and how" });
    await expect(where.getByText("Remote", { exact: true })).toBeVisible();
    await expect(where.getByText("Location", { exact: true })).toHaveCount(0);
    await expect(where.getByText("Exact meeting details are agreed privately between members.")).toHaveCount(0);
  });
});

test.describe("likes and saved offers", () => {
  test("a member saves and likes offers, finds them in Saved after reloading, and removes them", async ({ page, browser, baseURL }) => {
    test.slow();
    await signUpAndConfirm(page, newAccount("owner"));
    const title = `Desk fan ${randomUUID().slice(0, 6)}`;
    const id = await publishViaApi(page.request, baseURL as string, title, { area: "ibadan_ui" });
    // The owner sees no heart or bookmark on their own offer.
    await page.goto(`/offers/${id}`);
    await expect(page.getByRole("button", { name: `Save ${title}` })).toHaveCount(0);

    const viewer = await newPage(browser, baseURL as string);
    await signUpAndConfirm(viewer, newAccount("saver"));
    await viewer.goto("/explore");
    const saveOnCard = viewer.getByRole("button", { name: `Save ${title}` });
    await expect(saveOnCard).toHaveAttribute("aria-pressed", "false");
    const saved = viewer.waitForResponse((r) => r.url().endsWith(`/api/v1/offers/${id}/save`) && r.request().method() === "PUT");
    await saveOnCard.click();
    await expect(saveOnCard).toHaveAttribute("aria-pressed", "true");
    expect((await saved).status()).toBe(200);

    await viewer.goto(`/offers/${id}`);
    const likeOnPage = viewer.getByRole("button", { name: `Like ${title}` });
    const liked = viewer.waitForResponse((r) => r.url().endsWith(`/api/v1/offers/${id}/like`) && r.request().method() === "PUT");
    await likeOnPage.click();
    expect((await liked).status()).toBe(200);
    await viewer.reload();
    await expect(viewer.getByRole("button", { name: `Like ${title}` })).toHaveAttribute("aria-pressed", "true");
    await expect(viewer.getByRole("button", { name: `Save ${title}` })).toHaveAttribute("aria-pressed", "true");

    await viewer.getByRole("banner").getByRole("link", { name: "Saved" }).click();
    await expect(viewer.getByRole("heading", { name: "Saved offers", level: 1 })).toBeVisible();
    const entry = viewer.getByRole("list", { name: "Saved offers" }).getByRole("listitem").filter({ hasText: title });
    await expect(entry.getByText("University of Ibadan, Ibadan")).toBeVisible();
    const removed = viewer.waitForResponse((r) => r.url().endsWith(`/api/v1/offers/${id}/save`) && r.request().method() === "DELETE");
    await entry.getByRole("button", { name: `Save ${title}` }).click();
    expect((await removed).status()).toBe(200);
    await viewer.reload();
    await expect(viewer.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  });

  test("an offer that stops being available stays in Saved without its details until removed", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("pauser"));
    const title = `Kettle ${randomUUID().slice(0, 6)}`;
    const id = await publishViaApi(page.request, baseURL as string, title);
    const viewer = await newPage(browser, baseURL as string);
    await signUpAndConfirm(viewer, newAccount("keeper"));
    expect((await viewer.request.put(`/api/v1/offers/${id}/save`, { headers: { Origin: baseURL as string } })).status()).toBe(200);
    const offer = ((await (await page.request.get(`/api/v1/offers/${id}`)).json()) as { data: { status: string; revision: number } }).data;
    const paused = await page.request.post(`/api/v1/offers/${id}/pause`, {
      headers: { "Idempotency-Key": randomUUID(), Origin: baseURL as string },
      data: { expected_status: offer.status, expected_revision: offer.revision },
    });
    expect(paused.status()).toBe(200);
    await viewer.goto("/saved");
    await expect(viewer.getByText("This offer isn't available")).toBeVisible();
    await expect(viewer.getByText(title)).toHaveCount(0);
    await viewer.getByRole("button", { name: "Remove" }).click();
    await expect(viewer.getByRole("heading", { name: "Nothing saved yet" })).toBeVisible();
  });

  test("signed out, the heart and bookmark lead to sign-in and back", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("shown"));
    const title = `Guitar ${randomUUID().slice(0, 6)}`;
    const id = await publishViaApi(page.request, baseURL as string, title);
    const guest = await newPage(browser, baseURL as string);
    await guest.goto(`/offers/${id}`);
    await guest.getByRole("button", { name: `Sign in to save ${title}` }).click();
    await expect(guest).toHaveURL(new RegExp(`/sign-in\\?next=%2Foffers%2F${id}$`));
    const direct = await guest.request.put(`/api/v1/offers/${id}/save`, { headers: { Origin: baseURL as string } });
    expect(direct.status()).toBe(401);
    await guest.goto("/saved");
    await expect(guest).toHaveURL(/\/sign-in\?next=%2Fsaved$/);
  });

  for (const width of [375, 1280]) {
    test(`Saved has no serious accessibility issues at ${width}px`, async ({ page, browser, baseURL }) => {
      await signUpAndConfirm(page, newAccount("axe-owner"));
      const title = `Stool ${randomUUID().slice(0, 6)}`;
      const id = await publishViaApi(page.request, baseURL as string, title, { area: "ibadan_bodija", exchange_mode: "in_person", handover_methods: ["collection"] });
      const viewer = await newPage(browser, baseURL as string);
      await viewer.setViewportSize({ width, height: 800 });
      await signUpAndConfirm(viewer, newAccount("axe-saver"));
      await viewer.goto("/saved");
      expect(await axeBlocking(viewer)).toEqual([]);
      await viewer.request.put(`/api/v1/offers/${id}/save`, { headers: { Origin: baseURL as string } });
      await viewer.goto("/saved");
      await expect(viewer.getByText(title)).toBeVisible();
      expect(await axeBlocking(viewer)).toEqual([]);
      await viewer.goto(`/offers/${id}`);
      expect(await axeBlocking(viewer)).toEqual([]);
      const scrollWidth = await viewer.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);
    });
  }
});
