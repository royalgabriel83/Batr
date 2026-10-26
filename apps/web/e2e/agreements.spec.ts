import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  agree,
  axeBlocking,
  member,
  noSideScroll,
  publish,
} from "./support/exchanges";

// Milestone 4: agreements on the web, at phone and desktop widths
// against the real API and local Supabase (specs/milestone-4.md,
// Acceptance criteria): a change accepted, a cancellation kept,
// handover by both, then a change rejected and a cancellation agreed.

for (const width of [1280, 375]) {
  test(`change, keep and complete an agreement at ${String(width)}px`, async ({
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

    // 1. A finds it under Exchanges → Agreed, from the proposal too.
    await a.page.goto("/exchanges?box=agreed");
    await a.page
      .getByRole("list", { name: "Agreed" })
      .getByRole("link")
      .filter({ hasText: b.account.displayName })
      .click();
    await expect(a.page).toHaveURL(new RegExp(`${url}$`));
    await expect(
      a.page.getByRole("heading", { name: `Agreement with ${b.account.displayName}` }),
    ).toBeVisible();
    await expect(a.page.getByText("Arrange the handover with")).toBeVisible();
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);

    // 2. B proposes a change: ₦15,000 instead of ₦20,000.
    await b.page.goto(url);
    await b.page.getByRole("link", { name: "Propose a change" }).click();
    await expect(
      b.page.getByRole("heading", { name: "Propose a change", level: 1 }),
    ).toBeVisible();
    await b.page.getByLabel("Amount in naira").fill("15000");
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);
    await b.page.getByRole("button", { name: "Review terms" }).click();
    await expect(
      b.page.getByText(`The agreed terms stay in place until ${a.account.displayName} accepts these.`),
    ).toBeVisible();
    await b.page.getByRole("button", { name: "Send change" }).click();
    await expect(b.page).toHaveURL(new RegExp(`${url}$`));
    await expect(
      b.page.getByText(`Waiting for ${a.account.displayName} to answer your change`),
    ).toBeVisible();
    await expect(b.page.getByRole("button", { name: "Withdraw change" })).toBeVisible();

    // 3. A sees it waiting on them, with its change chip, and accepts it.
    await a.page.goto("/exchanges?box=agreed");
    const nav =
      width < 768
        ? a.page.getByRole("navigation", { name: "Primary" })
        : a.page.getByRole("navigation", { name: "Main" });
    await expect(
      nav.getByRole("link", { name: /Exchanges 1 waiting on you/ }),
    ).toBeVisible();
    await a.page.goto(url);
    await expect(
      a.page.getByText(`${b.account.displayName} proposed a change`, { exact: true }),
    ).toBeVisible();
    await expect(
      a.page.getByRole("list", { name: "Changes from the agreed terms" }),
    ).toContainText("Cash changed");
    await a.page.getByRole("button", { name: "Accept change" }).click();
    const dialog = a.page.getByRole("dialog", { name: "Accept these new terms?" });
    await expect(dialog).toContainText(`${b.account.displayName} pays ₦15,000`);
    expect(await axeBlocking(a.page)).toEqual([]);
    await dialog.getByRole("button", { name: "Accept change" }).click();
    await expect(a.page.getByText(/Version 2, in force since .* WAT/)).toBeVisible();
    await expect(a.page.getByRole("heading", { name: "Earlier versions" })).toBeVisible();

    // 4. A asks to cancel; B reads the reason and keeps the agreement.
    await a.page.getByRole("button", { name: "Ask to cancel" }).click();
    const ask = a.page.getByRole("dialog", { name: "Ask to cancel?" });
    await ask.getByLabel("Reason").fill("no");
    await ask.getByRole("button", { name: "Send request" }).click();
    await expect(ask.getByText("Give a reason of at least 3 characters.")).toBeVisible();
    await ask.getByLabel("Reason").fill("The lens might be cracked.");
    await ask.getByRole("button", { name: "Send request" }).click();
    await expect(
      a.page.getByText(`Waiting for ${b.account.displayName} to answer your request to cancel`),
    ).toBeVisible();
    await b.page.goto(url);
    await expect(b.page.getByText("“The lens might be cracked.”")).toBeVisible();
    expect(await axeBlocking(b.page)).toEqual([]);
    await b.page.getByRole("button", { name: "Keep the agreement" }).click();
    await expect(b.page.getByText("Arrange the handover with")).toBeVisible();

    // 5. Both hand over; the second completes it (A2: prompt to close).
    await b.page.getByRole("button", { name: "I've handed over my side" }).click();
    const confirm = b.page.getByRole("dialog", { name: "Confirm your handover?" });
    await expect(confirm).toContainText("You pay ₦15,000");
    await confirm.getByRole("button", { name: "Confirm handover" }).click();
    await expect(
      b.page.getByText(`Waiting for ${a.account.displayName} to confirm`),
    ).toBeVisible();
    await expect(b.page.getByRole("link", { name: "Propose a change" })).toHaveCount(0);
    await a.page.goto(url);
    await expect(
      a.page.getByText(`${b.account.displayName} has handed over`),
    ).toBeVisible();
    await a.page.getByRole("button", { name: "I've handed over my side" }).click();
    await a.page
      .getByRole("dialog", { name: "Confirm your handover?" })
      .getByRole("button", { name: "Confirm handover" })
      .click();
    await expect(a.page.getByText("Completed", { exact: true }).first()).toBeVisible();
    await expect(
      a.page.getByRole("link", { name: "Close it in My offers" }),
    ).toBeVisible();
    await expect(a.page.getByRole("button", { name: "Ask to cancel" })).toHaveCount(0);
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);

    await b.page.goto("/exchanges?box=closed");
    await expect(
      b.page
        .getByRole("list", { name: "Closed agreements" })
        .getByRole("link")
        .filter({ hasText: a.account.displayName }),
    ).toContainText("Completed");
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);
  });
}

test("a rejected change leaves the terms; an agreed cancellation ends it; others can't see it", async ({
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
  const id = await agree(b.page.request, a.page.request, base, lamp, books);
  const url = `/agreements/${id}`;

  await c.page.goto(url);
  await expect(c.page.getByRole("heading", { level: 1 })).not.toContainText(
    "Agreement with",
  );

  // A asks for cash from B to go up; B rejects it.
  await a.page.goto(`${url}/change`);
  await a.page.getByLabel("Amount in naira").fill("30000");
  await a.page.getByRole("button", { name: "Review terms" }).click();
  await a.page.getByRole("button", { name: "Send change" }).click();
  await b.page.goto(url);
  await b.page.getByRole("button", { name: "Reject change" }).click();
  await b.page
    .getByRole("dialog", { name: "Reject this change?" })
    .getByRole("button", { name: "Reject change" })
    .click();
  await expect(b.page.getByText(/Version 1, in force since .* WAT/)).toBeVisible();
  await expect(b.page.getByText("You pay ₦20,000").first()).toBeVisible();
  await expect(b.page.getByText("Version 2 · Rejected")).toBeVisible();

  // B asks to cancel; A agrees.
  await b.page.getByRole("button", { name: "Ask to cancel" }).click();
  const ask = b.page.getByRole("dialog", { name: "Ask to cancel?" });
  await ask.getByLabel("Reason").fill("I found the same lamp nearer home.");
  await ask.getByRole("button", { name: "Send request" }).click();
  await a.page.goto(url);
  await a.page.getByRole("button", { name: "Agree to cancel" }).click();
  await a.page
    .getByRole("dialog", { name: "Cancel this agreement?" })
    .getByRole("button", { name: "Agree to cancel" })
    .click();
  await expect(a.page.getByText(`You and ${b.account.displayName} agreed to cancel.`)).toBeVisible();
  await expect(a.page.getByText("“I found the same lamp nearer home.”")).toBeVisible();
  await expect(a.page.getByRole("button", { name: "I've handed over my side" })).toHaveCount(0);
  expect(await axeBlocking(a.page)).toEqual([]);
});
