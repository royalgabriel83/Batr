import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { agree, axeBlocking, member, noSideScroll, publish } from "./support/exchanges";
import { addPhotos, jpegPhoto, savedPhotos } from "./support/offers";

// Milestone 9: services as first-class offers (specs/milestone-9-services.md,
// Acceptance criteria 1, 3 and 5): a service is created and published
// without a condition, found with the Services filter, agreed and
// completed with service wording, at phone and desktop widths.

const SERVICE = {
  offer_type: "service",
  category: "repairs",
  condition: null,
  exchange_mode: "in_person",
  handover_methods: ["on_site_service"],
};

for (const width of [1280, 375]) {
  test(`create, find, agree and complete a service at ${String(width)}px`, async ({ browser, baseURL }) => {
    test.slow();
    const base = baseURL as string;
    const a = await member(browser, base, "simi", width);
    const b = await member(browser, base, "dayo", width);
    const suffix = randomUUID().slice(0, 6);
    const title = `Maths lessons ${suffix}`;

    // 1. A creates a service: no condition, service categories, wording and handover.
    await a.page.goto("/offers/new");
    await a.page.locator('label[for="offer_type-service"]').click();
    await expect(a.page.getByText("A photo of your work, your tools or a sample.")).toBeVisible();
    await addPhotos(a.page, [await jpegPhoto()]);
    await expect(savedPhotos(a.page)).toHaveCount(1);
    if (width < 768) await a.page.getByRole("button", { name: "Next" }).click();
    await a.page.getByLabel("Title").fill(title);
    await expect(a.page.getByLabel("Category").locator("option", { hasText: "Electronics" })).toHaveCount(0);
    await a.page.getByLabel("Category").selectOption({ label: "Lessons and tutoring" });
    await expect(a.page.getByRole("group", { name: /Condition/ })).toHaveCount(0);
    if (width < 768) await a.page.getByRole("button", { name: "Next" }).click();
    await a.page.getByLabel("What the service includes").fill("Two hours a week for a month");
    await a.page.getByLabel("What you'd like in return").fill("A used laptop");
    await a.page.locator('label[for="exchange_mode-either"]').click();
    await expect(a.page.locator('label[for="handover_methods-collection"]')).toHaveCount(0);
    await a.page.locator('label[for="handover_methods-on_site_service"]').click();
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);
    if (width < 768) await a.page.getByRole("button", { name: "Preview" }).click();
    await a.page.getByRole("button", { name: "Publish offer" }).click();
    await expect(a.page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();
    const service = /\/offers\/([0-9a-f-]{36})/.exec(a.page.url())?.[1] as string;
    await a.page.goto(`/offers/${service}`);
    await expect(a.page.getByRole("list", { name: "Category and type" })).toHaveText(/Lessons and tutoring\s*Service/);
    await expect(a.page.getByText("What the service includes")).toBeVisible();
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);

    // 2. Explore: Services lists it, Items doesn't, Both does.
    await b.page.goto("/explore");
    await b.page.getByRole("navigation", { name: "Items or services" }).getByRole("link", { name: "Services" }).click();
    await expect(b.page).toHaveURL(/type=service/);
    await expect(b.page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await expect(b.page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Electronics" })).toHaveCount(0);
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);
    await b.page.goto("/explore?type=item");
    await expect(b.page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

    // 3. B offers a service in return; A accepts. The handover asks for the service to be done.
    const theirs = await publish(b.page.request, base, `Phone repair ${suffix}`, SERVICE);
    const id = await agree(b.page.request, a.page.request, base, service, theirs);
    await b.page.goto(`/agreements/${id}`);
    await b.page.getByRole("button", { name: "I've handed over my side" }).click();
    const confirm = b.page.getByRole("dialog", { name: "Confirm your handover?" });
    await expect(confirm).toContainText("Confirm only once the service has been done.");
    await confirm.getByRole("button", { name: "Confirm handover" }).click();
    await expect(b.page.getByText(`Waiting for ${a.account.displayName} to confirm`)).toBeVisible();
    await a.page.goto(`/agreements/${id}`);
    await a.page.getByRole("button", { name: "I've handed over my side" }).click();
    await a.page.getByRole("dialog", { name: "Confirm your handover?" }).getByRole("button", { name: "Confirm handover" }).click();

    // 4. Completed: a service usually stays listed.
    await expect(a.page.getByText("Completed", { exact: true }).first()).toBeVisible();
    await expect(a.page.getByText("Services usually stay listed.")).toBeVisible();
    await expect(a.page.getByRole("link", { name: "Close it in My offers" })).toBeVisible();
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);
  });
}
