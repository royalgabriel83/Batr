import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { axeBlocking, headers, member, noSideScroll, publish } from "./support/exchanges";
import { grantModerator } from "./support/staff";

// Milestone 6: blocking, reporting and moderating on the web, at phone
// and desktop widths against the real API and local Supabase
// (specs/milestone-6.md, Acceptance criteria).

for (const width of [1280, 375]) {
  test(`members report and block, and a moderator acts, at ${String(width)}px`, async ({ browser, baseURL }) => {
    test.slow();
    const base = baseURL as string;
    const a = await member(browser, base, "ada", width);
    const b = await member(browser, base, "bayo", width);
    const mod = await member(browser, base, "mo", width);
    await grantModerator(mod.account.email);
    const suffix = randomUUID().slice(0, 6);
    const watchTitle = `Gold watch ${suffix}`;
    const watch = await publish(a.page.request, base, watchTitle);
    const camera = await publish(a.page.request, base, `Canon camera ${suffix}`);
    const bike = await publish(b.page.request, base, `Road bike ${suffix}`);
    const sent = await b.page.request.post("/api/v1/proposals", {
      headers: headers(base),
      data: { offer_id: camera, gives: [{ kind: "offer", offer_id: bike }], gets: [{ kind: "offer", offer_id: camera }] },
    });
    expect(sent.status()).toBe(201);
    const proposalId = ((await sent.json()) as { data: { id: string } }).data.id;
    const message = await b.page.request.post(`/api/v1/proposals/${proposalId}/messages`, {
      headers: headers(base),
      data: { body: "Send the deposit to my account first." },
    });
    expect(message.status()).toBe(201);

    // 1. B reports A's offer: a reason is needed, then only "Thanks".
    await b.page.goto(`/offers/${watch}`);
    await b.page.getByRole("button", { name: "Report offer" }).click();
    const dialog = b.page.getByRole("dialog", { name: "Report this offer" });
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog.getByText("Choose a reason.")).toBeVisible();
    await expect(dialog.getByRole("link", { name: "what can't be offered" })).toBeVisible();
    await dialog.getByRole("radio", { name: "Misleading or fake" }).check();
    await dialog.getByLabel("Details (optional)").fill("The photos are from another site.");
    expect(await axeBlocking(b.page)).toEqual([]);
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog.getByText("Thanks. BATR will review this.")).toBeVisible();
    await dialog.getByRole("button", { name: "Done" }).click();

    // A second report on the same offer while it's open is refused.
    await b.page.getByRole("button", { name: "Report offer" }).click();
    await dialog.getByRole("radio", { name: "Spam" }).check();
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog.getByText("You've already reported this. BATR will review it.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();

    // 2. My reports shows it as Received, without the outcome.
    await b.page.goto("/account/reports");
    const mine = b.page.getByRole("listitem").filter({ hasText: watchTitle });
    await expect(mine).toContainText("Misleading or fake");
    await expect(mine).toContainText("Received");
    await noSideScroll(b.page);
    expect(await axeBlocking(b.page)).toEqual([]);

    // 3. A reports B's message from the conversation.
    await a.page.goto(`/exchanges/${proposalId}`);
    await a.page.getByRole("button", { name: "Report this message" }).click();
    const messageDialog = a.page.getByRole("dialog", { name: "Report this message" });
    await messageDialog.getByRole("radio", { name: "Scam or fraud" }).check();
    await messageDialog.getByRole("button", { name: "Send report" }).click();
    await expect(messageDialog.getByText("Thanks. BATR will review this.")).toBeVisible();
    await messageDialog.getByRole("button", { name: "Done" }).click();

    // 4. Members can't open moderation; the moderator can.
    expect((await a.page.goto("/moderation"))?.status()).toBe(404);
    await mod.page.goto("/moderation");
    await expect(mod.page.getByRole("heading", { name: "Cases", level: 1 })).toBeVisible();
    await noSideScroll(mod.page);
    expect(await axeBlocking(mod.page)).toEqual([]);
    await mod.page.getByRole("link").filter({ hasText: watchTitle }).click();
    await expect(mod.page.getByRole("heading", { name: watchTitle, level: 1 })).toBeVisible();
    await expect(mod.page.getByText("The photos are from another site.")).toBeVisible();
    await noSideScroll(mod.page);
    expect(await axeBlocking(mod.page)).toEqual([]);
    await mod.page.getByRole("radio", { name: /Remove the offer/ }).check();
    await mod.page.getByLabel(/Note for the record/).fill("No");
    await mod.page.getByRole("button", { name: "Remove the offer…" }).click();
    await expect(mod.page.getByText("Write a note of 10 to 1000 characters.")).toBeVisible();
    await mod.page.getByLabel(/Note for the record/).fill("Photos copied from another listing.");
    await mod.page.getByRole("button", { name: "Remove the offer…" }).click();
    // A consequential action asks once more, restating what happens.
    await expect(mod.page.getByRole("dialog", { name: "Remove this offer?" })).toBeVisible();
    await mod.page.getByRole("button", { name: "Remove offer", exact: true }).click();
    await expect(mod.page.getByText("Closed", { exact: true })).toBeVisible();
    await expect(mod.page.getByText("Removed the offer")).toBeVisible();

    // The message report shows the message in context.
    await mod.page.goto("/moderation");
    await mod.page.getByRole("link").filter({ hasText: `A message from ${b.account.displayName}` }).first().click();
    await expect(mod.page.getByText("Send the deposit to my account first.")).toBeVisible();
    await expect(mod.page.getByText(/· Reported$/)).toBeVisible();

    // 5. A sees the offer as removed; B's report is Reviewed.
    await a.page.goto("/my-offers");
    await expect(a.page.getByRole("listitem").filter({ hasText: watchTitle })).toContainText("Removed by BATR");
    await b.page.goto("/account/reports");
    await expect(mine).toContainText("Reviewed");

    // 6. A blocks B from the proposal: it closes quietly and the offers hide.
    await a.page.goto(`/exchanges/${proposalId}`);
    await a.page.getByRole("button", { name: `Block ${b.account.displayName}` }).click();
    const confirm = a.page.getByRole("dialog", { name: `Block ${b.account.displayName}?` });
    await expect(confirm).toContainText("Agreements you've already made stay as they are.");
    await confirm.getByRole("button", { name: "Block" }).click();
    await expect(a.page.getByText("This proposal was closed.").first()).toBeVisible();
    await expect(a.page.getByText("This conversation is closed.")).toBeVisible();

    await b.page.goto(`/exchanges/${proposalId}`);
    await expect(b.page.getByText("This proposal was closed.").first()).toBeVisible();
    expect((await b.page.goto(`/offers/${camera}`))?.status()).toBe(404);

    // 7. A unblocks from the account; the offer is visible again.
    await a.page.goto("/account/blocked");
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);
    await a.page.getByRole("button", { name: `Unblock ${b.account.displayName}` }).click();
    await expect(a.page.getByText("No one is blocked")).toBeVisible();
    expect((await b.page.goto(`/offers/${camera}`))?.status()).toBe(200);
  });
}

test("the rules page lists what can't be offered", async ({ page }) => {
  await page.goto("/rules");
  await expect(page.getByRole("heading", { name: "What can't be offered" })).toBeVisible();
  await expect(page.getByText("Weapons and ammunition")).toBeVisible();
  expect(await axeBlocking(page)).toEqual([]);
});

test("a suspended member sees the banner until a moderator lifts it", async ({ browser, baseURL }) => {
  test.slow();
  const base = baseURL as string;
  const a = await member(browser, base, "ada", 375);
  const b = await member(browser, base, "bayo", 375);
  const mod = await member(browser, base, "mo", 1280);
  await grantModerator(mod.account.email);
  const desk = await publish(a.page.request, base, `Office desk ${randomUUID().slice(0, 6)}`);
  const filed = await b.page.request.post("/api/v1/reports", {
    headers: headers(base),
    data: { subject_type: "member", offer_id: desk, reason: "harassment" },
  });
  expect(filed.status()).toBe(201);
  const reportId = ((await filed.json()) as { data: { id: string } }).data.id;

  await mod.page.goto(`/moderation/${reportId}`);
  await expect(mod.page.getByRole("heading", { name: `${a.account.displayName}'s offers` })).toBeVisible();
  await mod.page.getByRole("radio", { name: /Suspend a member/ }).check();
  await mod.page.getByLabel(/Note for the record/).fill("Several harassment reports this week.");
  await mod.page.getByRole("button", { name: `Suspend ${a.account.displayName}…` }).click();
  await mod.page.getByRole("button", { name: "Suspend member", exact: true }).click();
  await expect(mod.page.getByText("Member suspended")).toBeVisible();

  await a.page.goto("/my-offers");
  await expect(a.page.getByText("Your account is limited. You can't publish, propose or message for now.")).toBeVisible();
  await noSideScroll(a.page);
  expect(await axeBlocking(a.page)).toEqual([]);
  // Their offers are hidden from everyone else.
  expect((await b.page.goto(`/offers/${desk}`))?.status()).toBe(404);

  await mod.page.goto("/moderation/suspensions");
  await mod.page.getByRole("button", { name: `Lift suspension for ${a.account.displayName}` }).click();
  await mod.page.getByLabel("Why lift it?").fill("Spoke with the member by email.");
  await mod.page.getByRole("button", { name: "Lift suspension", exact: true }).click();
  await expect(mod.page.getByRole("button", { name: `Lift suspension for ${a.account.displayName}` })).toHaveCount(0);

  await a.page.reload();
  await expect(a.page.getByText("Your account is limited.", { exact: false })).toHaveCount(0);
  expect((await b.page.goto(`/offers/${desk}`))?.status()).toBe(200);
});
