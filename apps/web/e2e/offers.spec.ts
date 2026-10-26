import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PHOTO_MESSAGES, PUBLISH_RULE_MESSAGES } from "@batr/shared";
import { newAccount, signIn, signUpAndConfirm } from "./support/auth";
import {
  addPhotos,
  completeOffer,
  fillOffer,
  heicFile,
  jpegPhoto,
  myOfferRow,
  offerIdFrom,
  oversizedJpeg,
  publishOffer,
  renamedPdf,
  savedPhotos,
  visitorStatus,
} from "./support/offers";

// Unit 07: create and manage offers in the browser, against the real
// API and local Supabase (milestone-1.md, acceptance criteria 4–9, 17,
// 19, 30, 31; 02-offer-creation.md).

const header = (page: Page) => page.getByRole("banner");

/** Publishes through the phone steps (offer-steps.spec.ts has the detailed checks). */
async function publishOfferOnPhone(page: Page, title: string) {
  await page.goto("/offers/new");
  await addPhotos(page, [await jpegPhoto()]);
  await expect(savedPhotos(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Next" }).click();
  const offer = completeOffer(title);
  await fillOffer(page, { title: offer.title, category: offer.category, condition: offer.condition });
  await page.getByRole("button", { name: "Next" }).click();
  await fillOffer(page, { offering: offer.offering, wants: offer.wants });
  await page.getByRole("button", { name: "Preview" }).click();
  await page.getByRole("button", { name: "Publish offer" }).click();
  await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();
}

async function axeBlocking(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

test.describe("create and manage offers", () => {
  test("publish with two photos, then pause, resume and close from My offers", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("offer"));
    await header(page).getByRole("link", { name: "Create offer" }).click();
    await expect(page.getByRole("heading", { name: "Create an offer", level: 1 })).toBeVisible();

    await fillOffer(page, completeOffer("Road bike"));
    await addPhotos(page, [await jpegPhoto("front.jpg"), await jpegPhoto("side.jpg", { r: 200, g: 40, b: 40 })]);
    await expect(savedPhotos(page)).toHaveCount(2);
    await expect(savedPhotos(page).first().getByText("Cover")).toBeVisible();
    const id = await offerIdFrom(page);

    // Reorder with the keyboard-accessible buttons; the second photo becomes the cover.
    const second = await savedPhotos(page).nth(1).getAttribute("data-photo-id");
    await page.getByRole("button", { name: "Move Photo 2 earlier" }).click();
    await expect(savedPhotos(page).first()).toHaveAttribute("data-photo-id", second as string);

    // The preview uses the same component as the offer page.
    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("heading", { name: "Road bike", level: 2 })).toBeVisible();
    await expect(page.getByText("A two-person tent")).toBeVisible();
    await expect(page.getByText(/^Member since /)).toBeVisible();
    await page.getByRole("button", { name: "Publish offer" }).click();

    await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();
    expect(await visitorStatus(browser, baseURL as string, id)).toEqual({ status: 200, title: "Road bike" });

    await page.getByRole("link", { name: "Go to My offers" }).click();
    const row = myOfferRow(page, "Road bike");
    await expect(page.getByRole("region", { name: /Active/ }).getByRole("heading", { name: "Road bike" })).toBeVisible();
    await expect(row.getByText("Active", { exact: true })).toBeVisible();

    await row.getByRole("button", { name: "Pause Road bike" }).click();
    await expect(row.getByText("Paused", { exact: true })).toBeVisible();
    expect((await visitorStatus(browser, baseURL as string, id)).status).toBe(404);

    await row.getByRole("button", { name: "Resume Road bike" }).click();
    await expect(row.getByText("Active", { exact: true })).toBeVisible();
    expect((await visitorStatus(browser, baseURL as string, id)).status).toBe(200);

    await row.getByRole("button", { name: "Close Road bike" }).click();
    const dialog = page.getByRole("dialog", { name: "Close this offer?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close offer" }).click();
    await expect(row.getByText("Closed", { exact: true })).toBeVisible();
    await expect(row.getByRole("link", { name: /Edit/ })).toHaveCount(0);
    expect((await visitorStatus(browser, baseURL as string, id)).status).toBe(404);

    // Closed is final: the API refuses publishing again, and the edit page is read-only.
    const again = await page.request.post(`/api/v1/offers/${id}/publish`, {
      headers: { "Idempotency-Key": randomUUID(), Origin: baseURL as string },
      data: { expected_revision: 1, expected_status: "closed" },
    });
    expect(again.status()).toBe(409);
    await page.goto(`/offers/${id}/edit`);
    await expect(page.getByRole("heading", { name: "Closed offer" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save|Publish/ })).toHaveCount(0);
  });

  test("leaving after adding a photo keeps a draft only the owner can see", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("draft"));
    await page.goto("/offers/new");
    await page.getByLabel("Title").fill("Desk lamp");
    await addPhotos(page, [await jpegPhoto()]);
    await expect(savedPhotos(page)).toHaveCount(1);
    const id = await offerIdFrom(page);

    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();
    await page.goto("/my-offers");
    await expect(page.getByRole("region", { name: /Drafts/ }).getByRole("heading", { name: "Desk lamp" })).toBeVisible();
    await expect(myOfferRow(page, "Desk lamp").getByText("Draft", { exact: true })).toBeVisible();

    expect((await visitorStatus(browser, baseURL as string, id)).status).toBe(404);
    const other = await browser.newContext({ baseURL });
    const otherPage = await other.newPage();
    await signUpAndConfirm(otherPage, newAccount("other"));
    await otherPage.goto(`/offers/${id}/edit`);
    await expect(otherPage.getByRole("heading", { name: "This offer isn't available" })).toBeVisible();
    await other.close();
  });

  test("publishing an incomplete offer shows every field error; the API refuses it and it stays a draft", async ({ page, baseURL }) => {
    await signUpAndConfirm(page, newAccount("invalid"));
    await page.goto("/offers/new");
    await page.getByLabel("Title").fill("Bike");
    await page.getByRole("button", { name: "Publish offer" }).click();

    for (const message of [
      PUBLISH_RULE_MESSAGES.photos,
      PUBLISH_RULE_MESSAGES.title,
      PUBLISH_RULE_MESSAGES.category,
      PUBLISH_RULE_MESSAGES.condition,
      PUBLISH_RULE_MESSAGES.offering_text,
      PUBLISH_RULE_MESSAGES.wants_text,
    ]) {
      await expect(page.getByText(message)).toBeVisible();
    }
    // Focus moves to the first problem on the page: the photos.
    await expect(page.locator("#photos-add")).toBeFocused();
    await expect(page.getByLabel("Title")).toHaveAttribute("aria-invalid", "true");

    // The draft that exists (saved without photos) cannot be published through the API either.
    await page.getByRole("button", { name: "Save draft" }).click();
    const id = await offerIdFrom(page);
    const refused = await page.request.post(`/api/v1/offers/${id}/publish`, {
      headers: { "Idempotency-Key": randomUUID(), Origin: baseURL as string },
      data: { expected_revision: 1, expected_status: "draft" },
    });
    expect(refused.status()).toBe(422);
    await page.goto("/my-offers");
    await expect(myOfferRow(page, "Bike").getByText("Draft", { exact: true })).toBeVisible();
  });

  test("HEIC, a renamed PDF and a 12 MB photo are refused on their tiles before upload; other photos still upload", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("photos"));
    await page.goto("/offers/new");
    const uploads: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && /\/photos$/.test(new URL(request.url()).pathname)) uploads.push(request.url());
    });

    await addPhotos(page, [heicFile(), renamedPdf(), oversizedJpeg(), await jpegPhoto("good.jpg")]);
    await expect(page.locator("[data-pending-photo='IMG_0001.HEIC']").getByText(PHOTO_MESSAGES.heic)).toBeVisible();
    await expect(page.locator("[data-pending-photo='holiday.jpg']").getByText(PHOTO_MESSAGES.unsupported)).toBeVisible();
    await expect(page.locator("[data-pending-photo='huge.jpg']").getByText(PHOTO_MESSAGES.tooLarge)).toBeVisible();
    await expect(savedPhotos(page)).toHaveCount(1);
    expect(uploads).toHaveLength(1);

    // A refused tile can be dismissed; it never offers Retry.
    const heicTile = page.locator("[data-pending-photo='IMG_0001.HEIC']");
    await expect(heicTile.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await heicTile.getByRole("button", { name: /Remove photo/ }).click();
    await expect(heicTile).toHaveCount(0);
  });

  test("deleting a draft asks first and removes it", async ({ page, baseURL, browser }) => {
    await signUpAndConfirm(page, newAccount("delete"));
    await page.goto("/offers/new");
    await page.getByLabel("Title").fill("Old chair");
    await addPhotos(page, [await jpegPhoto()]);
    await expect(savedPhotos(page)).toHaveCount(1);
    const id = await offerIdFrom(page);
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();

    await page.goto("/my-offers");
    await myOfferRow(page, "Old chair").getByRole("button", { name: "Delete Old chair" }).click();
    const dialog = page.getByRole("dialog", { name: "Delete this draft?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(myOfferRow(page, "Old chair")).toBeVisible();

    await myOfferRow(page, "Old chair").getByRole("button", { name: "Delete Old chair" }).click();
    await dialog.getByRole("button", { name: "Delete draft" }).click();
    await expect(page.getByRole("heading", { name: "You haven't created any offers yet" })).toBeVisible();
    const owner = await page.request.get(`/api/v1/offers/${id}`);
    expect(owner.status()).toBe(404);
    expect((await visitorStatus(browser, baseURL as string, id)).status).toBe(404);
  });

  test("editing an active offer keeps it active; breaking a publish rule is refused and nothing changes", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("active-edit"));
    const id = await publishOffer(page, "Camping stove");
    await page.goto(`/offers/${id}/edit`);
    await expect(page.getByRole("heading", { name: "Edit offer" })).toBeVisible();

    await page.getByLabel("Title").fill("Camping stove, two burners");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Changes saved")).toBeVisible();
    expect(await visitorStatus(browser, baseURL as string, id)).toEqual({ status: 200, title: "Camping stove, two burners" });

    await page.getByLabel("Title").fill("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText(PUBLISH_RULE_MESSAGES.title)).toBeVisible();
    await expect(page.getByLabel("Title")).toBeFocused();

    // Removing the only photo of an active offer is refused by the API.
    await page.getByRole("button", { name: /Remove photo/ }).click();
    await expect(page.locator("#photos-error")).toHaveText(PUBLISH_RULE_MESSAGES.photos);
    await expect(savedPhotos(page)).toHaveCount(1);
    expect(await visitorStatus(browser, baseURL as string, id)).toEqual({ status: 200, title: "Camping stove, two burners" });
  });

  test("a save based on an old version is refused, keeps what was typed and shows the latest saved value", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL });
    const first = await context.newPage();
    await signUpAndConfirm(first, newAccount("conflict"));
    await first.goto("/offers/new");
    await first.getByLabel("Title").fill("Guitar");
    await first.getByRole("button", { name: "Save draft" }).click();
    const id = await offerIdFrom(first);

    const second = await context.newPage();
    await second.goto(`/offers/${id}/edit`);
    await first.getByLabel("Title").fill("Acoustic guitar");
    await first.getByRole("button", { name: "Save draft" }).click();
    await expect(first.getByText("Draft saved")).toBeVisible();

    await second.getByLabel("Title").fill("Electric guitar");
    await second.getByRole("button", { name: "Save draft" }).click();
    await expect(second.getByRole("alert").getByText(/changed in another window or device/)).toBeVisible();
    await expect(second.getByText("Latest saved title: Acoustic guitar")).toBeVisible();
    await expect(second.getByLabel("Title")).toHaveValue("Electric guitar");

    // Saving again now applies on top of the latest version.
    await second.getByRole("button", { name: "Save draft" }).click();
    await expect(second.getByText("Draft saved")).toBeVisible();
    const saved = await second.request.get(`/api/v1/offers/${id}`);
    expect(((await saved.json()) as { data: { title: string } }).data.title).toBe("Electric guitar");
    await context.close();
  });

  test("if the session ends mid-form, the member signs in again and their typing is restored", async ({ page, context }) => {
    const account = await signUpAndConfirm(page, newAccount("session"));
    await page.goto("/offers/new");
    await page.getByLabel("Title").fill("Sewing machine");
    await page.getByRole("button", { name: "Save draft" }).click();
    const id = await offerIdFrom(page);
    await expect(page.getByText("Draft saved")).toBeVisible();

    await page.getByLabel("What you'd like in return").fill("Garden tools");
    await context.clearCookies();
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page).toHaveURL(/\/sign-in\?next=/);
    await signIn(page, account);
    await expect(page).toHaveURL(new RegExp(`/offers/${id}/edit$`));
    await expect(page.getByText("We restored the changes you hadn't saved.")).toBeVisible();
    await expect(page.getByLabel("What you'd like in return")).toHaveValue("Garden tools");
  });

  test("two quick publish clicks publish once", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("double"));
    await page.goto("/offers/new");
    await fillOffer(page, completeOffer("Two-person tent"));
    await addPhotos(page, [await jpegPhoto()]);
    await expect(savedPhotos(page)).toHaveCount(1);
    const publishes: number[] = [];
    page.on("response", (response) => {
      if (/\/publish$/.test(new URL(response.url()).pathname)) publishes.push(response.status());
    });
    await page.getByRole("button", { name: "Publish offer" }).dblclick();
    await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();
    expect(publishes).toEqual([200]);
  });

  test("an offer can be created with the keyboard alone", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("keyboard"));
    await page.goto("/offers/new");
    await page.getByLabel("Title").focus();
    await page.keyboard.type("Board game");
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowDown"); // first category
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space"); // condition: New
    await page.keyboard.press("Tab");
    await page.keyboard.type("Complete, all pieces.");
    await page.keyboard.press("Tab");
    await page.keyboard.type("A board game");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Open to offers");

    const chooser = page.waitForEvent("filechooser");
    await page.locator("#photos-add").focus();
    await page.keyboard.press("Enter");
    await (await chooser).setFiles([await jpegPhoto()]);
    await expect(savedPhotos(page)).toHaveCount(1);

    await page.getByRole("button", { name: "Publish offer" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();
  });

  test("create offer and My offers work at 1280px with no serious accessibility issues", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await signUpAndConfirm(page, newAccount("axe1280"));
    await page.goto("/my-offers");
    expect(await axeBlocking(page)).toEqual([]);

    await page.goto("/offers/new");
    expect(await axeBlocking(page)).toEqual([]);
    await page.getByRole("button", { name: "Publish offer" }).click();
    await expect(page.getByText(PUBLISH_RULE_MESSAGES.title)).toBeVisible();
    expect(await axeBlocking(page)).toEqual([]);

    await fillOffer(page, completeOffer("Kettle"));
    await addPhotos(page, [await jpegPhoto()]);
    await expect(savedPhotos(page)).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
    await page.getByRole("button", { name: "Preview" }).click();
    expect(await axeBlocking(page)).toEqual([]);
    await page.getByRole("button", { name: "Publish offer" }).click();
    await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();

    await page.goto("/my-offers");
    expect(await axeBlocking(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  });

  // The 375px create flow (in steps) is covered in offer-steps.spec.ts.
  test("My offers works at 375px with every kind of row and no serious accessibility issues", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await signUpAndConfirm(page, newAccount("axe375"));
    await publishOfferOnPhone(page, "A very long offer title that keeps going to test wrapping");
    await page.goto("/my-offers");
    await myOfferRow(page, "A very long offer title that keeps going to test wrapping").getByRole("button", { name: /^Pause/ }).click();
    await page.goto("/offers/new");
    await addPhotos(page, [await jpegPhoto()]);
    await expect(savedPhotos(page)).toHaveCount(1);
    await page.goto("/my-offers");
    expect(await axeBlocking(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });

  test("signed-out visitors are sent to sign in from the offer pages", async ({ page }) => {
    await page.goto("/offers/new");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Foffers%2Fnew$/);
    await page.goto("/my-offers");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Fmy-offers$/);
  });

  test("offer pages are not stored by the browser or shared caches", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("cache"));
    for (const path of ["/offers/new", "/my-offers"]) {
      const response = await page.goto(path);
      expect(response?.headers()["cache-control"], path).toContain("no-store");
    }
  });
});
