import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { CONTACT_DETAILS_MESSAGES } from "@batr/shared";
import { agree, axeBlocking, member, noSideScroll, publish } from "./support/exchanges";

// Milestone 7: contact details are refused in the message box and the
// offer form, with the typed text kept (specs/milestone-7-contact-
// details.md, Acceptance 3 and 7).

for (const width of [1280, 375]) {
  test(`a message with a phone number isn't sent and stays in the box at ${String(width)}px`, async ({ browser, baseURL }) => {
    test.slow();
    const base = baseURL as string;
    const a = await member(browser, base, "ada", width);
    const b = await member(browser, base, "bayo", width);
    const suffix = randomUUID().slice(0, 6);
    const camera = await publish(a.page.request, base, `Canon camera ${suffix}`);
    const bike = await publish(b.page.request, base, `Road bike ${suffix}`);
    const id = await agree(b.page.request, a.page.request, base, camera, bike);

    await b.page.goto(`/agreements/${id}`);
    const box = b.page.getByLabel(`Message ${a.account.displayName}`);
    const thread = b.page.getByRole("list", { name: `Messages with ${a.account.displayName}` });
    await box.fill("Call me on 0803 123 4567");
    await b.page.getByRole("button", { name: "Send" }).click();
    await expect(b.page.getByText(CONTACT_DETAILS_MESSAGES.message).first()).toBeVisible();
    await expect(box).toHaveValue("Call me on 0803 123 4567");
    await expect(thread).not.toContainText("0803");
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);

    // A handle is sent, with a warning only the sender sees.
    await box.fill("Find me @bayo_store");
    await b.page.getByRole("button", { name: "Send" }).click();
    await expect(thread).toContainText("Find me @bayo_store");
    await expect(b.page.getByText(CONTACT_DETAILS_MESSAGES.warning)).toBeVisible();
    await a.page.goto(`/agreements/${id}`);
    await expect(a.page.getByRole("list", { name: `Messages with ${b.account.displayName}` })).toContainText("Find me @bayo_store");
    await expect(a.page.getByText(CONTACT_DETAILS_MESSAGES.warning)).toHaveCount(0);
  });
}

test("the offer form refuses an email in the description and keeps the typing", async ({ browser, baseURL }) => {
  const a = await member(browser, baseURL as string, "ada", 1280);
  await a.page.goto("/offers/new");
  await a.page.getByLabel("Title").fill("Desk lamp, warm light");
  await a.page.getByLabel("Description").fill("Email me at ada.obi@gmail.com for more photos");
  await a.page.getByRole("button", { name: "Save draft" }).click();
  await expect(a.page.getByText(CONTACT_DETAILS_MESSAGES.field).first()).toBeVisible();
  await expect(a.page.getByLabel("Description")).toHaveValue("Email me at ada.obi@gmail.com for more photos");
});
