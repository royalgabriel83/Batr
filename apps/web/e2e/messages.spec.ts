import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  agree,
  axeBlocking,
  member,
  noSideScroll,
  publish,
} from "./support/exchanges";

// Milestone 5: messages and in-app notifications on the web, at phone
// and desktop widths against the real API and local Supabase
// (specs/milestone-5.md, Acceptance criteria): talk on the agreement,
// see the reply arrive without a reload, find it from the bell and the
// Messages page, and a third member can't open it.

for (const width of [1280, 375]) {
  test(`members message each other and are notified at ${String(width)}px`, async ({
    browser,
    baseURL,
  }) => {
    test.slow();
    const base = baseURL as string;
    const a = await member(browser, base, "ada", width);
    const b = await member(browser, base, "bayo", width);
    const suffix = randomUUID().slice(0, 6);
    const camera = await publish(a.page.request, base, `Canon camera ${suffix}`);
    const bike = await publish(b.page.request, base, `Road bike ${suffix}`);
    const id = await agree(b.page.request, a.page.request, base, camera, bike);
    const url = `/agreements/${id}`;

    // 1. B opens the agreement: the thread shows what happened so far.
    await b.page.goto(url);
    const bThread = b.page.getByRole("list", { name: `Messages with ${a.account.displayName}` });
    await expect(bThread).toContainText("You sent a proposal.");
    await expect(bThread).toContainText(`${a.account.displayName} accepted. You have an agreement.`);
    await expect(b.page.getByText(`Say hello to ${a.account.displayName}.`)).toBeVisible();
    await expect(b.page.getByText("BATR never asks for your bank details in a message.")).toBeVisible();

    // 2. A has the page open when B writes; it arrives without a reload.
    await a.page.goto(url);
    const aThread = a.page.getByRole("list", { name: `Messages with ${b.account.displayName}` });
    await b.page.getByRole("button", { name: "Send" }).click();
    await expect(b.page.getByText("Write a message first.")).toBeVisible();
    await b.page.getByLabel(`Message ${a.account.displayName}`).fill("Saturday at noon? See https://example.test");
    await b.page.getByRole("button", { name: "Send" }).click();
    await expect(bThread).toContainText("Saturday at noon?");
    await expect(aThread).toContainText("Saturday at noon?", { timeout: 10_000 });
    // N3: links stay plain text.
    await expect(aThread.getByRole("link")).toHaveCount(0);
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);

    // 3. A replies; B isn't on the page, so the bell and Messages count it.
    await a.page.getByLabel(`Message ${b.account.displayName}`).fill("Noon works. The lens is clean.");
    await a.page.getByRole("button", { name: "Send" }).click();
    await expect(aThread).toContainText("Noon works.");
    await b.page.goto("/explore");
    await expect(b.page.getByRole("link", { name: /Notifications 2 unread/ })).toBeVisible();

    // 4. The Messages page lists the conversation with its unread count.
    await b.page.goto("/messages");
    const row = b.page
      .getByRole("list", { name: "Conversations" })
      .getByRole("link")
      .filter({ hasText: a.account.displayName });
    await expect(row).toContainText("Noon works. The lens is clean.");
    await expect(row).toContainText("1 unread");
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);

    // 5. The bell lists the reply and the acceptance; opening one goes to the agreement.
    await b.page.goto("/notifications");
    const list = b.page.getByRole("list", { name: "Notifications" });
    await expect(list).toContainText(`${a.account.displayName} sent you a message.`);
    await expect(list).toContainText(`${a.account.displayName} accepted. You have an agreement.`);
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);
    await list.getByRole("link").filter({ hasText: "sent you a message" }).click();
    await expect(b.page).toHaveURL(new RegExp(`${url}#messages$`));
    await expect(bThread).toContainText("Noon works.");

    // 6. Read: the counts clear.
    await b.page.goto("/messages");
    await expect(row).not.toContainText("unread");
    await b.page.goto("/notifications");
    await b.page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(b.page.getByRole("link", { name: /Notifications \d+ unread/ })).toHaveCount(0);
  });
}

test("a third member can't open the conversation; a closed one can't take messages", async ({
  browser,
  baseURL,
}) => {
  test.slow();
  const base = baseURL as string;
  const a = await member(browser, base, "ada", 1280);
  const b = await member(browser, base, "bayo", 1280);
  const c = await member(browser, base, "chika", 1280);
  const suffix = randomUUID().slice(0, 6);
  const lamp = await publish(a.page.request, base, `Desk lamp ${suffix}`);
  const books = await publish(b.page.request, base, `Novels ${suffix}`);
  const sent = await b.page.request.post("/api/v1/proposals", {
    headers: { "Idempotency-Key": randomUUID(), Origin: base },
    data: { offer_id: lamp, gives: [{ kind: "offer", offer_id: books }], gets: [{ kind: "offer", offer_id: lamp }] },
  });
  const proposal = ((await sent.json()) as { data: { id: string } }).data;

  const hidden = await c.page.request.get(`/api/v1/proposals/${proposal.id}/messages`);
  expect(hidden.status()).toBe(404);

  await b.page.goto(`/exchanges/${proposal.id}`);
  await b.page.getByRole("button", { name: "Withdraw" }).click();
  await b.page.getByRole("dialog").getByRole("button", { name: /Withdraw/ }).click();
  await expect(b.page.getByText("This conversation is closed.")).toBeVisible();
  await expect(b.page.getByRole("button", { name: "Send" })).toHaveCount(0);
  await expect(
    b.page.getByRole("list", { name: `Messages with ${a.account.displayName}` }),
  ).toContainText("You withdrew the proposal.");
});
