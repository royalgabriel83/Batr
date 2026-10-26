import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  axeBlocking,
  member,
  noSideScroll,
  publish,
} from "./support/exchanges";

// Milestone 3: propose and negotiate on the web, the whole journey at
// phone and desktop widths against the real API and local Supabase
// (specs/milestone-3.md, Acceptance criteria).

for (const width of [1280, 375]) {
  test(`propose, counter and agree at ${String(width)}px`, async ({
    browser,
    baseURL,
  }) => {
    test.slow();
    const base = baseURL as string;
    const a = await member(browser, base, "ada", width);
    const b = await member(browser, base, "bayo", width);
    const suffix = randomUUID().slice(0, 6);
    const cameraTitle = `Canon camera ${suffix}`;
    const bikeTitle = `Road bike ${suffix}`;
    const camera = await publish(a.page.request, base, cameraTitle);
    await publish(b.page.request, base, bikeTitle);

    // 1. B proposes on A's offer: B's bike, a described item and ₦20,000 from B.
    await b.page.goto(`/offers/${camera}`);
    await b.page.getByRole("link", { name: "Propose an exchange" }).click();
    await expect(
      b.page.getByRole("heading", { name: "Propose an exchange", level: 1 }),
    ).toBeVisible();
    await b.page.getByText(bikeTitle).click();
    await b.page.getByRole("button", { name: "Describe an item" }).click();
    await b.page.getByLabel("Described item 1").fill("A phone charger");
    await b.page.getByText("You pay", { exact: true }).click();
    await b.page.getByLabel("Amount in naira").fill("20,000");
    await expect(
      b.page.getByRole("region", { name: "Your exchange" }),
    ).toContainText("You pay ₦20,000");
    await b.page.getByLabel("Note (optional)").fill("Happy to meet in Yaba.");
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);
    await b.page.getByRole("button", { name: "Review terms" }).click();
    await expect(
      b.page.getByRole("heading", { name: "Check the terms" }),
    ).toBeVisible();
    await b.page.getByRole("button", { name: "Send proposal" }).click();
    await expect(b.page).toHaveURL(/\/exchanges\/[0-9a-f-]{36}$/);
    const proposalUrl = b.page.url();
    await expect(
      b.page.getByText(`Waiting for ${a.account.displayName}`),
    ).toBeVisible();
    await expect(
      b.page.getByRole("button", { name: "Withdraw" }),
    ).toBeVisible();
    await expect(b.page.getByRole("button", { name: "Accept" })).toHaveCount(0);

    // 2. A sees it under Your turn, with the count, and counters with ₦5,000.
    await a.page.goto("/exchanges");
    const turnList = a.page.getByRole("list", { name: "Your turn" });
    await expect(
      turnList.getByRole("link").filter({ hasText: b.account.displayName }),
    ).toBeVisible();
    const nav =
      width < 768
        ? a.page.getByRole("navigation", { name: "Primary" })
        : a.page.getByRole("navigation", { name: "Main" });
    await expect(
      nav.getByRole("link", { name: /Exchanges 1 waiting on you/ }),
    ).toBeVisible();
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);
    await turnList
      .getByRole("link")
      .filter({ hasText: b.account.displayName })
      .click();
    await expect(a.page.getByText("Your turn", { exact: true })).toBeVisible();
    await expect(
      a.page.getByText(`${b.account.displayName} pays ₦20,000`).first(),
    ).toBeVisible();
    expect(await axeBlocking(a.page)).toEqual([]);
    await a.page.getByRole("link", { name: "Counter" }).click();
    await expect(
      a.page.getByRole("heading", { name: "Counter with new terms" }),
    ).toBeVisible();
    // A note alone is refused.
    await a.page.getByLabel("Note (optional)").fill("Add a little more?");
    await a.page.getByRole("button", { name: "Review terms" }).click();
    await expect(
      a.page
        .getByRole("alert")
        .filter({ hasText: "A new note alone isn't new terms" }),
    ).toBeVisible();
    await a.page.getByLabel("Amount in naira").fill("25000");
    await a.page.getByRole("button", { name: "Review terms" }).click();
    await a.page.getByRole("button", { name: "Send counter" }).click();
    await expect(a.page).toHaveURL(proposalUrl);
    await expect(
      a.page.getByText(`Waiting for ${b.account.displayName}`),
    ).toBeVisible();

    // 3. B sees the new terms with their change chip and accepts in a dialog that restates them.
    await b.page.goto(proposalUrl);
    await expect(
      b.page
        .getByRole("list", { name: "Changes from the terms before" })
        .first(),
    ).toContainText("Cash changed");
    await expect(
      b.page.getByRole("heading", { name: "History" }),
    ).toBeVisible();
    await b.page.getByRole("button", { name: "Accept" }).click();
    const dialog = b.page.getByRole("dialog", { name: "Accept these terms?" });
    await expect(dialog).toContainText("You pay ₦25,000");
    expect(await axeBlocking(b.page)).toEqual([]);
    await dialog.getByRole("button", { name: "Accept" }).click();
    await expect(
      b.page.getByRole("heading", { name: "Agreed", exact: true }),
    ).toBeVisible();
    await expect(
      b.page.getByRole("heading", { name: "Agreed terms" }),
    ).toBeVisible();
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);

    // 4. A sees Agreed and is prompted to pause or close the offer (D1).
    await a.page.goto(proposalUrl);
    await expect(
      a.page.getByRole("heading", { name: "Agreed", exact: true }),
    ).toBeVisible();
    await expect(
      a.page.getByRole("link", { name: "Pause or close it in My offers" }),
    ).toBeVisible();
    // The agreement sits under Agreed (Milestone 4, A6).
    await a.page.goto("/exchanges?box=agreed");
    await expect(
      a.page
        .getByRole("list", { name: "Agreed" })
        .getByRole("link")
        .filter({ hasText: b.account.displayName }),
    ).toContainText("Agreed");
  });
}

test("the owner sees proposals on their offer; others can't open them; declining closes it", async ({
  browser,
  baseURL,
}) => {
  test.slow();
  const base = baseURL as string;
  const a = await member(browser, base, "ada", 1280);
  const b = await member(browser, base, "bayo", 1280);
  const c = await member(browser, base, "chika", 1280);
  const title = `Desk lamp ${randomUUID().slice(0, 6)}`;
  const lamp = await publish(a.page.request, base, title);

  // Signed out, Propose leads to sign-in and back.
  const visitor = await (await browser.newContext({ baseURL: base })).newPage();
  await visitor.goto(`/offers/${lamp}`);
  await visitor.getByRole("link", { name: "Propose an exchange" }).click();
  await expect(visitor).toHaveURL(/\/sign-in\?next=%2Foffers%2F.+%2Fpropose$/);

  // B has no offers: describing an item is enough.
  await b.page.goto(`/offers/${lamp}/propose`);
  await expect(b.page.getByText("You have no active offers.")).toBeVisible();
  await b.page.getByRole("button", { name: "Describe an item" }).click();
  await b.page.getByLabel("Described item 1").fill("Two novels");
  await b.page.getByRole("button", { name: "Review terms" }).click();
  await b.page.getByRole("button", { name: "Send proposal" }).click();
  await expect(b.page).toHaveURL(/\/exchanges\/[0-9a-f-]{36}$/);
  const url = b.page.url();
  // The offer page now leads to it.
  await b.page.goto(`/offers/${lamp}`);
  await expect(
    b.page.getByRole("link", { name: "View your proposal" }),
  ).toBeVisible();

  await a.page.goto(`/offers/${lamp}`);
  await expect(
    a.page.getByRole("link", { name: "Propose an exchange" }),
  ).toHaveCount(0);
  const list = a.page.getByRole("region", { name: /Proposals on this offer/ });
  await expect(
    list.getByRole("link").filter({ hasText: b.account.displayName }),
  ).toContainText("Two novels");

  await c.page.goto(url);
  await expect(c.page.getByRole("heading", { level: 1 })).not.toContainText(
    "Exchange with",
  );

  await a.page.goto(url);
  await a.page.getByRole("button", { name: "Decline" }).click();
  await a.page
    .getByRole("dialog", { name: "Decline these terms?" })
    .getByRole("button", { name: "Decline" })
    .click();
  await expect(a.page.getByText("You declined these terms.")).toBeVisible();
  await b.page.goto("/exchanges?box=closed");
  await expect(
    b.page
      .getByRole("list", { name: "Closed" })
      .getByRole("link")
      .filter({ hasText: a.account.displayName }),
  ).toContainText("Declined");
  expect(await axeBlocking(b.page)).toEqual([]);
});
