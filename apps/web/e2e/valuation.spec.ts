import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { newAccount, signUpAndConfirm } from "./support/auth";
import { jpegPhoto } from "./support/offers";
import { grantReviewer } from "./support/staff";

// Structured valuation, review, fee quote and appeal (owner,
// 2026-10-17), against the real API and local Supabase.

async function axeBlocking(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
}

async function newPage(browser: Browser, baseURL: string): Promise<Page> {
  return (await browser.newContext({ baseURL })).newPage();
}

async function publishViaApi(request: APIRequestContext, baseURL: string, title: string): Promise<string> {
  const headers = () => ({ "Idempotency-Key": randomUUID(), Origin: baseURL });
  const created = await request.post("/api/v1/offers", {
    headers: headers(),
    data: { title, category: "electronics", condition: "good", offering_text: "A Samsung phone", wants_text: "A laptop" },
  });
  let offer = ((await created.json()) as { data: { id: string; status: string; revision: number } }).data;
  const photo = await jpegPhoto();
  const uploaded = await request.post(`/api/v1/offers/${offer.id}/photos`, {
    headers: headers(),
    multipart: { file: { name: photo.name, mimeType: photo.mimeType, buffer: photo.buffer }, expected_status: offer.status, expected_revision: String(offer.revision) },
  });
  offer = ((await uploaded.json()) as { data: typeof offer }).data;
  const published = await request.post(`/api/v1/offers/${offer.id}/publish`, { headers: headers(), data: { expected_status: offer.status, expected_revision: offer.revision } });
  expect(published.status()).toBe(200);
  return offer.id;
}

/** Fills the first physical item with a phone's details. */
async function fillPhone(page: Page) {
  await page.getByRole("button", { name: "Add physical goods" }).click();
  await page.getByLabel("Category", { exact: true }).selectOption({ label: "Electronics" });
  await page.getByLabel("Description", { exact: true }).fill("Samsung Galaxy A54 with charger and case.");
  await page.getByLabel("Value you propose (₦)").fill("90,000");
  await page.getByLabel("Product name").fill("Galaxy A54");
  await page.getByLabel("New or used").selectOption({ label: "Used" });
  await page.getByLabel("Condition", { exact: true }).selectOption({ label: "Good: normal signs of use" });
  await page.getByLabel("Does it work?").selectOption({ label: "Fully working" });
  await page.locator('label[for="c0-has_known_defects-no"]').click();
  await page.getByLabel("Approximate age in months").fill("14");
}

test.describe("valuation", () => {
  test("a member is valued, a reviewer approves, the fee is quoted and the member appeals", async ({ page, browser, baseURL }) => {
    test.slow();
    const title = `Phone ${randomUUID().slice(0, 6)}`;
    await signUpAndConfirm(page, newAccount("valued"));
    const offerId = await publishViaApi(page.request, baseURL as string, title);

    await page.goto(`/offers/${offerId}`);
    await page.getByRole("link", { name: "Valuation" }).click();
    await expect(page.getByRole("heading", { name: "Get BATR's valuation" })).toBeVisible();
    await page.getByRole("button", { name: "Start a valuation" }).click();
    await fillPhone(page);

    // Sending without photos or the declaration says what is missing.
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Add at least 2 photos of the actual item from different angles.")).toBeVisible();
    await expect(page.getByText("Confirm that the information is accurate.")).toBeVisible();

    await page.locator('input[type="file"]').first().setInputFiles([await jpegPhoto("front.jpg"), await jpegPhoto("back.jpg", { r: 200, g: 40, b: 40 })]);
    await expect(page.getByRole("button", { name: "Open Photo of the item" })).toHaveCount(2);
    // PDFs stay off until BATR scans uploads for malware (owner, 2026-10-18).
    for (const accept of await page.locator('input[type="file"]').evaluateAll((inputs) => inputs.map((el) => el.getAttribute("accept") ?? ""))) {
      expect(accept).not.toContain("pdf");
    }
    await expect(page.getByText("PDFs aren't accepted yet", { exact: false }).first()).toBeVisible();
    expect(await axeBlocking(page)).toEqual([]);
    await page.locator('label[for="declaration"]').click();
    await page.getByRole("button", { name: "Send for review" }).click();
    await expect(page.getByText("Waiting for review")).toBeVisible();
    expect(await axeBlocking(page)).toEqual([]);

    // A BATR reviewer records the value.
    const reviewerAccount = newAccount("reviewer");
    const reviewer = await newPage(browser, baseURL as string);
    await signUpAndConfirm(reviewer, reviewerAccount);
    await grantReviewer(reviewerAccount.email);
    await reviewer.goto("/review");
    await reviewer.getByRole("link", { name: new RegExp(title) }).click();
    await expect(reviewer.getByRole("heading", { name: title })).toBeVisible();
    expect(await axeBlocking(reviewer)).toEqual([]);
    await reviewer.getByLabel("Galaxy A54 (₦)").fill("100000");
    await reviewer.getByLabel("Rationale").fill("Matches recent sales of the same model in Ibadan.");
    await reviewer.getByRole("button", { name: "Record decision" }).click();
    await expect(reviewer.getByRole("heading", { name: "BATR's assessed value" })).toBeVisible();

    // The member sees the value and the fee: 3% of ₦100,000, half each.
    await page.reload();
    await expect(page.getByText("₦100,000").first()).toBeVisible();
    const fee = page.getByRole("region", { name: "Platform fee" });
    await expect(fee.getByText("₦3,000")).toBeVisible();
    await expect(fee.getByText("₦1,500")).toHaveCount(2);
    expect(await axeBlocking(page)).toEqual([]);

    // Signed-out visitors learn only that BATR assessed it: the value is in neither the page nor its HTML.
    const guest = await newPage(browser, baseURL as string);
    const guestResponse = await guest.goto(`/offers/${offerId}`);
    const indicator = guest.getByRole("region", { name: "Assessed by BATR" });
    await expect(indicator.getByText("to see the assessed value")).toBeVisible();
    await expect(guest.getByText("₦100,000")).toHaveCount(0);
    const html = (await guestResponse?.text()) ?? "";
    expect(html).not.toMatch(/100,000|10000000|total_noncash_kobo/);
    expect(guestResponse?.headers()["cache-control"] ?? "").not.toMatch(/public|s-maxage/);
    const raw = await guest.request.get(`/offers/${offerId}`, { headers: { RSC: "1" } });
    expect(await raw.text()).not.toMatch(/100,000|10000000|total_noncash_kobo/);
    expect((await guest.request.get(`/api/v1/offers/${offerId}/valuation`)).status()).toBe(401);

    // Signed-in members see the value.
    const member = await newPage(browser, baseURL as string);
    await signUpAndConfirm(member, newAccount("browser"));
    await member.goto(`/offers/${offerId}`);
    await expect(member.getByRole("region", { name: "Assessed by BATR" }).getByText("₦100,000")).toBeVisible();

    // The member appeals; a second, final appeal stays available.
    await expect(page.getByText("You can appeal twice.")).toBeVisible();
    await page.getByLabel("Why you're appealing").fill("The same phone sold for ₦110,000 in Bodija last week.");
    await page.getByRole("button", { name: "Send appeal" }).click();
    await expect(page.getByText("Appeal in progress")).toBeVisible();
    await expect(page.getByText("Appeal 1 of 2")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Disagree with the decision?" })).toHaveCount(0);
  });

  test("the review area is not shown to members who aren't BATR staff", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("curious"));
    const response = await page.goto("/review");
    expect(response?.status()).toBe(404);
  });

  test("signed-out visitors are sent to sign in, and other members can't open a valuation", async ({ page, browser, baseURL }) => {
    await signUpAndConfirm(page, newAccount("owner"));
    const offerId = await publishViaApi(page.request, baseURL as string, `Lamp ${randomUUID().slice(0, 6)}`);
    const guest = await newPage(browser, baseURL as string);
    await guest.goto(`/offers/${offerId}/valuation`);
    await expect(guest).toHaveURL(/\/sign-in/);
    const other = await newPage(browser, baseURL as string);
    await signUpAndConfirm(other, newAccount("other"));
    const response = await other.goto(`/offers/${offerId}/valuation`);
    expect(response?.status()).toBe(404);
  });
});
