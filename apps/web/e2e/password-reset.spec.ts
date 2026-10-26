import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { AUTH_MESSAGES } from "@batr/shared";
import { fillSignUp, inbox, newAccount, resetLink, signIn, signUpAndConfirm, type TestAccount } from "./support/auth";

// Password reset, unit 08c (specs/milestone-1.md, Password reset;
// acceptance criteria 36-41). Link expiry and single use are also
// covered against Supabase in supabase/tests/password-reset.db.test.ts.

const main = (page: Page) => page.getByRole("main");

async function freshPage(browser: Browser, baseURL: string | undefined): Promise<Page> {
  return (await browser.newContext({ baseURL })).newPage();
}

async function requestLink(page: Page, email: string): Promise<void> {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(main(page).getByRole("status")).toHaveText(AUTH_MESSAGES.resetSent);
}

/** Requests a link for `account` and opens it in `page`, which lands on the new-password form. */
async function openResetForm(page: Page, account: TestAccount, emailsBefore = 1): Promise<string> {
  await requestLink(page, account.email);
  const link = await resetLink(account.email, emailsBefore + 1);
  await page.goto(link);
  await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible();
  return link;
}

test.describe("password reset", () => {
  test("a member resets from Sign in; other sessions are signed out and only the new password works", async ({
    page,
    browser,
    baseURL,
  }) => {
    // Two existing sessions of the same member, on other "devices".
    const account = await signUpAndConfirm(page, newAccount("reset"));
    const other = await freshPage(browser, baseURL);
    await other.goto("/sign-in");
    await signIn(other, account);
    await expect(other).toHaveURL(/\/account$/);

    // The browser that resets starts signed out, from Sign in.
    const resetting = await freshPage(browser, baseURL);
    await resetting.goto("/sign-in?next=%2Fmy-offers");
    await resetting.getByRole("link", { name: "Forgot password?" }).click();
    await expect(resetting).toHaveURL(/\/forgot-password\?next=%2Fmy-offers$/);
    await resetting.getByLabel("Email").fill(account.email);
    await resetting.getByRole("button", { name: "Send reset link" }).click();
    await expect(main(resetting).getByRole("status")).toHaveText(AUTH_MESSAGES.resetSent);

    await resetting.goto(await resetLink(account.email));
    await expect(resetting).toHaveURL(/\/reset-password$/);
    await expect(main(resetting).getByText(`For ${account.email}`)).toBeVisible();

    // The sign-up rule applies, and the current password is refused.
    await resetting.getByLabel("New password").fill("short");
    await resetting.getByRole("button", { name: "Save new password" }).click();
    await expect(resetting.getByText("Use at least 10 characters.")).toBeVisible();
    await resetting.getByLabel("New password").fill(account.password);
    await resetting.getByRole("button", { name: "Save new password" }).click();
    await expect(resetting.getByText(AUTH_MESSAGES.samePassword)).toBeVisible();
    // The password is never echoed back into the form.
    await expect(resetting.getByLabel("New password")).toHaveValue("");

    const newPassword = `${account.password}-new`;
    await resetting.getByLabel("New password").fill(newPassword);
    await resetting.getByRole("button", { name: "Save new password" }).click();
    await expect(resetting).toHaveURL(/\/account\?changed=password$/);
    await expect(main(resetting).getByRole("status")).toHaveText(AUTH_MESSAGES.passwordChanged);

    // The browser that reset stays signed in; the reset page is no longer open to it.
    await resetting.goto("/my-offers");
    await expect(resetting).toHaveURL(/\/my-offers$/);
    await resetting.goto("/reset-password");
    await expect(resetting).toHaveURL(/\/forgot-password\?error=link$/);

    // Both other sessions are signed out.
    for (const signedOut of [page, other]) {
      await signedOut.goto("/account");
      await expect(signedOut).toHaveURL(/\/sign-in\?next=%2Faccount$/);
    }

    // The old password no longer works; the new one does.
    await signIn(other, account);
    await expect(main(other).getByRole("alert")).toHaveText(AUTH_MESSAGES.wrongCredentials);
    await signIn(other, { email: account.email, password: newPassword });
    await expect(other).toHaveURL(/\/account$/);
  });

  test("the reply is the same for a registered, an unregistered and an unconfirmed email", async ({ page, browser, baseURL }) => {
    const registered = await signUpAndConfirm(await freshPage(browser, baseURL), newAccount("known"));
    const unconfirmed = newAccount("pending");
    const signUpPage = await freshPage(browser, baseURL);
    await signUpPage.goto("/sign-up");
    await fillSignUp(signUpPage, unconfirmed);
    await expect(signUpPage.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect.poll(async () => (await inbox(unconfirmed.email)).length).toBe(1);
    // Supabase allows one email per address per second (auth.email.max_frequency).
    await page.waitForTimeout(1_100);

    const pages: string[] = [];
    for (const email of [registered.email, newAccount("nobody").email, unconfirmed.email]) {
      await requestLink(page, email);
      await expect(page).toHaveURL(/\/forgot-password$/);
      pages.push((await main(page).innerText()).replace(email, "EMAIL"));
    }
    expect(new Set(pages).size).toBe(1);
    await expect.poll(async () => (await inbox(registered.email)).length).toBe(2);
  });

  test("a used or tampered link never opens the form and asks for a new link", async ({ page, browser, baseURL }) => {
    const account = await signUpAndConfirm(page, newAccount("used"));
    const resetting = await freshPage(browser, baseURL);
    const link = await openResetForm(resetting, account);

    // A second use, in another browser.
    const later = await freshPage(browser, baseURL);
    await later.goto(link);
    await expect(later).toHaveURL(/\/forgot-password\?error=link$/);
    await expect(main(later).getByRole("alert")).toHaveText(AUTH_MESSAGES.resetLinkInvalid);

    const tampered = new URL(link);
    tampered.searchParams.set("token_hash", `${tampered.searchParams.get("token_hash") ?? ""}x`);
    await later.goto(tampered.toString());
    await expect(later).toHaveURL(/\/forgot-password\?error=link$/);
  });

  test("without a reset session the page never shows the form and no password changes", async ({ page, browser, baseURL }) => {
    // Signed out.
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/forgot-password\?error=link$/);
    await expect(main(page).getByRole("alert")).toHaveText(AUTH_MESSAGES.resetLinkInvalid);

    // Signed in normally, even with a copied-looking marker cookie.
    const account = await signUpAndConfirm(page, newAccount("plain"));
    await page.context().addCookies([{ name: "batr_recovery", value: "not-this-session", url: baseURL as string }]);
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/forgot-password\?error=link$/);
    await expect(page.getByLabel("New password")).toHaveCount(0);

    // A reset session that loses its marker before submitting changes nothing.
    const resetting = await freshPage(browser, baseURL);
    await openResetForm(resetting, account);
    await resetting.context().clearCookies({ name: "batr_recovery" });
    await resetting.getByLabel("New password").fill(`${account.password}-new`);
    await resetting.getByRole("button", { name: "Save new password" }).click();
    await expect(resetting).toHaveURL(/\/forgot-password\?error=link$/);

    const check = await freshPage(browser, baseURL);
    await check.goto("/sign-in");
    await signIn(check, account);
    await expect(check).toHaveURL(/\/account$/);
  });

  test("both pages work with the keyboard alone", async ({ page, browser, baseURL }) => {
    const account = await signUpAndConfirm(await freshPage(browser, baseURL), newAccount("keys"));
    await page.goto("/sign-in");
    await page.getByLabel("Password").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Forgot password?" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/forgot-password/);
    await page.getByLabel("Email").focus();
    await page.keyboard.type(account.email);
    await page.keyboard.press("Enter");
    await expect(main(page).getByRole("status")).toHaveText(AUTH_MESSAGES.resetSent);

    await page.goto(await resetLink(account.email));
    await page.getByLabel("New password").focus();
    await page.keyboard.type(`${account.password}-keys`);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save new password" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/account\?changed=password$/);
  });

  for (const width of [375, 1280]) {
    test(`both pages have no accessibility violations at ${width}px, including errors and replies`, async ({
      page,
      browser,
      baseURL,
    }) => {
      const axe = async (p: Page) => {
        const results = await new AxeBuilder({ page: p }).analyze();
        expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
        expect(await p.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      };
      const account = await signUpAndConfirm(await freshPage(browser, baseURL), newAccount("axe"));
      await page.setViewportSize({ width, height: 800 });

      await page.goto("/forgot-password?error=link");
      await axe(page);
      await page.getByRole("button", { name: "Send reset link" }).click();
      await expect(page.getByText("Enter your email address.")).toBeVisible();
      await axe(page);
      await requestLink(page, account.email);
      await axe(page);

      await page.goto(await resetLink(account.email));
      await expect(page).toHaveURL(/\/reset-password$/);
      await axe(page);
      await page.getByRole("button", { name: "Save new password" }).click();
      await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
      await axe(page);
    });
  }
});
