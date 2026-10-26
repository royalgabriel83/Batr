import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { agree, axeBlocking, headers, member, noSideScroll, publish } from "./support/exchanges";
import { grantModerator } from "./support/staff";

// Milestone 8: the moderation workspace and exchange problems on the
// web, at phone and desktop widths against the real API and local
// Supabase (specs/milestone-8-moderation-and-disputes.md).

const MONEY_NOTE = "BATR records the agreed amount only. It can't return money or items.";

for (const width of [1280, 375]) {
  test(`a member reports a problem, the exchange pauses, and a moderator resumes it, at ${String(width)}px`, async ({ browser, baseURL }) => {
    test.slow();
    const base = baseURL as string;
    const a = await member(browser, base, "ada", width);
    const b = await member(browser, base, "bayo", width);
    const mod = await member(browser, base, "mo", width);
    await grantModerator(mod.account.email);
    const suffix = randomUUID().slice(0, 6);
    const title = `Canon camera ${suffix}`;
    const camera = await publish(a.page.request, base, title);
    const bike = await publish(b.page.request, base, `Road bike ${suffix}`);
    const agreementId = await agree(b.page.request, a.page.request, base, camera, bike);

    // 1. B reports a problem: a reason and 20 characters are needed.
    await b.page.goto(`/agreements/${agreementId}`);
    await b.page.getByRole("button", { name: "Report a problem with this exchange" }).click();
    const dialog = b.page.getByRole("dialog", { name: "Report a problem with this exchange" });
    await expect(dialog.getByText(MONEY_NOTE)).toBeVisible();
    await dialog.getByRole("button", { name: "Send to BATR" }).click();
    await expect(dialog.getByText("Choose a reason.")).toBeVisible();
    await dialog.getByRole("radio", { name: "The other member didn't show up" }).check();
    await dialog.getByLabel(/What happened\?/).fill("We agreed Ikeja at 4pm and nobody came.");
    expect(await axeBlocking(b.page)).toEqual([]);
    await dialog.getByRole("button", { name: "Send to BATR" }).click();
    await expect(b.page.getByRole("heading", { name: "Paused while BATR reviews a problem with this exchange." })).toBeVisible();
    await expect(b.page.getByText(/You reported: The other member didn't show up/)).toBeVisible();
    await expect(b.page.getByRole("button", { name: "I've handed over my side" })).toHaveCount(0);
    await noSideScroll(b.page);

    // 2. A is told, not who reported it, and adds their side once.
    await a.page.goto(`/agreements/${agreementId}`);
    await expect(a.page.getByText("A problem was reported with this exchange. A person at BATR will review it.", { exact: false }).first()).toBeVisible();
    await expect(a.page.getByText(/You reported/)).toHaveCount(0);
    await expect(a.page.getByText(MONEY_NOTE)).toBeVisible();
    await a.page.getByLabel(/Add your side/).fill("I waited at the gate from 4 to 5.");
    await a.page.getByRole("button", { name: "Send your side" }).click();
    await expect(a.page.getByText("You've added your side. BATR will read it with the report.")).toBeVisible();
    await noSideScroll(a.page);
    expect(await axeBlocking(a.page)).toEqual([]);

    // 3. The moderator finds the case by type and search, takes it, and resumes.
    expect((await a.page.goto("/moderation"))?.status()).toBe(404);
    await mod.page.goto("/moderation");
    await mod.page.getByLabel("Type").selectOption("agreement");
    await mod.page.getByLabel("Search").fill(suffix);
    await mod.page.getByRole("button", { name: "Show cases" }).click();
    const row = mod.page.getByRole("link").filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText("High risk");
    await expect(row).toContainText("Unassigned");
    await noSideScroll(mod.page);
    expect(await axeBlocking(mod.page)).toEqual([]);
    await row.click();
    await expect(mod.page.getByRole("heading", { name: "The exchange" })).toBeVisible();
    await expect(mod.page.getByText("I waited at the gate from 4 to 5.")).toBeVisible();
    await expect(mod.page.getByText(MONEY_NOTE)).toBeVisible();
    await expect(mod.page.getByText("Counts only. Other cases' content isn't shown here.")).toBeVisible();
    await mod.page.getByRole("button", { name: "Take this case" }).click();
    await expect(mod.page.getByText("Assigned to you", { exact: true })).toBeVisible();
    await expect(mod.page.getByText("Took the case")).toBeVisible();
    await noSideScroll(mod.page);
    expect(await axeBlocking(mod.page)).toEqual([]);
    await mod.page.getByRole("radio", { name: /Resume the agreement/ }).check();
    await mod.page.getByLabel(/Note for the record/).fill("Both were late; carry on with the exchange.");
    await mod.page.getByRole("button", { name: "Resume the agreement…" }).click();
    const confirm = mod.page.getByRole("dialog", { name: "Resume this agreement?" });
    await confirm.getByRole("button", { name: "Resume agreement" }).click();
    await expect(mod.page.getByText("Closed", { exact: true })).toBeVisible();
    await expect(mod.page.getByText("Resumed the agreement")).toBeVisible();

    // 4. The pause is lifted for both.
    await a.page.goto(`/agreements/${agreementId}`);
    await expect(a.page.getByRole("heading", { name: "BATR has reviewed the problem" })).toBeVisible();
    await expect(a.page.getByRole("button", { name: "I've handed over my side" })).toBeVisible();
  });
}

test("a warned member sees the warning once", async ({ browser, baseURL }) => {
  test.slow();
  const base = baseURL as string;
  const a = await member(browser, base, "ada", 375);
  const b = await member(browser, base, "bayo", 375);
  const mod = await member(browser, base, "mo", 1280);
  await grantModerator(mod.account.email);
  const desk = await publish(a.page.request, base, `Office desk ${randomUUID().slice(0, 6)}`);
  const filed = await b.page.request.post("/api/v1/reports", { headers: headers(base), data: { subject_type: "member", offer_id: desk, reason: "harassment" } });
  const reportId = ((await filed.json()) as { data: { id: string } }).data.id;

  await mod.page.goto(`/moderation/${reportId}`);
  await mod.page.getByRole("radio", { name: /Warn a member/ }).check();
  await mod.page.getByLabel(/Note for the record/).fill("First report; a warning is enough.");
  await mod.page.getByRole("button", { name: `Warn ${a.account.displayName}` }).click();
  await expect(mod.page.getByText("Warned the member")).toBeVisible();

  await a.page.goto("/my-offers");
  await expect(a.page.getByText("BATR reviewed a report about you. Please follow the rules.")).toBeVisible();
  await expect(a.page.getByRole("link", { name: "Read the rules" })).toBeVisible();
  await noSideScroll(a.page);
  expect(await axeBlocking(a.page)).toEqual([]);
  await a.page.reload();
  await expect(a.page.getByText("BATR reviewed a report about you.", { exact: false })).toHaveCount(0);
});

test("the moderation queue says when nothing matches, and Clear resets the filters", async ({ browser, baseURL }) => {
  const mod = await member(browser, baseURL as string, "mo", 375);
  await grantModerator(mod.account.email);
  await mod.page.goto(`/moderation?q=${randomUUID()}`);
  await expect(mod.page.getByRole("heading", { name: "No cases match" })).toBeVisible();
  await mod.page.getByRole("link", { name: "Clear" }).click();
  await expect(mod.page).toHaveURL(/\/moderation$/);
});
