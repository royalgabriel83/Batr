import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { AUTH_MESSAGES } from "@batr/shared";
import { confirmationLink, fillSignUp, inbox, newAccount, signIn, signOut, signUpAndConfirm } from "./support/auth";

// Unit 05 (specs/milestone-1.md): sign up, verify email through the local
// inbox, sign in, sign out, display name; protected pages redirect and
// return. Runs against the real local Supabase.

const header = (page: Page) => page.getByRole("banner");
// Scoped to the page content: Next.js adds its own live region for route announcements.
const main = (page: Page) => page.getByRole("main");

test.describe("auth", () => {
  test("a new member signs up, confirms, changes their name, signs out and back in", async ({ page }) => {
    const account = newAccount("ada");
    await page.goto("/");
    // The home page has no sign-up link of its own (owner, 2026-10-17): Sign in, then Create an account.
    await page.getByRole("banner").getByRole("link", { name: "Sign in" }).click();
    await page.getByRole("link", { name: "Create an account" }).click();
    await expect(page).toHaveURL(/\/sign-up\?next=%2Faccount$/);
    await fillSignUp(page, account);

    await expect(page).toHaveURL(/\/sign-up\/check-email/);
    await expect(page.getByText(account.email)).toBeVisible();
    // Not signed in until the email is confirmed.
    await expect(header(page).getByRole("link", { name: "Sign in" })).toBeVisible();

    await page.goto(await confirmationLink(account.email));
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
    await expect(page.getByText(account.email)).toBeVisible();
    await expect(page.getByText(/^Member since \w+ \d{4}$/)).toBeVisible();
    await expect(header(page).getByRole("button", { name: /your account/ })).toContainText(account.displayName);

    // Display name: a row with Change, which opens the form in place;
    // refused with a link, then saved trimmed.
    await expect(main(page).getByText(account.displayName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Change display name" }).click();
    const nameField = page.getByLabel("Display name");
    await expect(nameField).toBeFocused();
    await expect(nameField).toHaveValue(account.displayName);
    await nameField.fill("ada.com");
    await page.getByRole("button", { name: "Save display name" }).click();
    await expect(page.getByText("Display names can't include links.")).toBeVisible();
    await nameField.fill("  Ada Lovelace  ");
    await page.getByRole("button", { name: "Save display name" }).click();
    await expect(main(page).getByRole("status")).toHaveText(AUTH_MESSAGES.displayNameSaved);
    // The row closes on success and focus returns to Change.
    await expect(page.getByRole("button", { name: "Change display name" })).toBeFocused();
    await expect(main(page).getByText("Ada Lovelace", { exact: true })).toBeVisible();
    await expect(header(page).getByRole("button", { name: /your account/ })).toContainText("Ada Lovelace");
    await page.reload();
    await expect(main(page).getByText("Ada Lovelace", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(header(page).getByRole("link", { name: "Sign in" })).toBeVisible();

    // Protected page after sign-out: sign in, then back to the page.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
    await signIn(page, account);
    await expect(page).toHaveURL(/\/account$/);
    await expect(main(page).getByText("Ada Lovelace", { exact: true })).toBeVisible();
  });

  test("a protected page returns the member to the exact page, and ?next cannot leave the site", async ({ page }) => {
    const account = await signUpAndConfirm(page, newAccount("grace"));
    await signOut(page);

    await page.goto("/account?tab=profile");
    await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount%3Ftab%3Dprofile$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await signIn(page, account);
    await expect(page).toHaveURL(/\/account\?tab=profile$/);

    await signOut(page);
    await page.goto("/sign-in?next=https%3A%2F%2Fevil.example%2F");
    await signIn(page, account);
    await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/account$/);
  });

  test("wrong password and unknown email get the same generic message", async ({ page }) => {
    const account = await signUpAndConfirm(page, newAccount("lin"));
    await signOut(page);

    await page.goto("/sign-in");
    await signIn(page, { email: account.email, password: "not the password" });
    await expect(main(page).getByRole("alert")).toHaveText(AUTH_MESSAGES.wrongCredentials);
    await expect(page.getByLabel("Email")).toHaveValue(account.email);

    await page.goto("/sign-in");
    await signIn(page, { email: newAccount("nobody").email, password: "not the password" });
    await expect(main(page).getByRole("alert")).toHaveText(AUTH_MESSAGES.wrongCredentials);
  });

  test("signing up again with a registered email looks the same as a new sign-up", async ({ page }) => {
    const account = await signUpAndConfirm(page, newAccount("dup"));
    await signOut(page);
    await page.goto("/sign-up");
    await fillSignUp(page, { ...account, password: "another password" });
    await expect(page).toHaveURL(/\/sign-up\/check-email/);
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });

  test("an unconfirmed member is told to confirm and can resend the link", async ({ page }) => {
    const account = newAccount("tom");
    await page.goto("/sign-up");
    await fillSignUp(page, account);
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect.poll(async () => (await inbox(account.email)).length).toBe(1);
    // Supabase allows one email per address per second (auth.email.max_frequency).
    await page.waitForTimeout(1_100);

    await page.getByRole("button", { name: "Send the link again" }).click();
    await expect(main(page).getByRole("status")).toHaveText(AUTH_MESSAGES.resent);
    await expect.poll(async () => (await inbox(account.email)).length).toBe(2);

    await page.goto("/sign-in");
    await signIn(page, account);
    await expect(main(page).getByRole("alert")).toHaveText(AUTH_MESSAGES.emailNotConfirmed);
    await page.waitForTimeout(1_100);
    await page.getByRole("button", { name: "Send the link again" }).click();
    await expect(main(page).getByRole("status")).toHaveText(AUTH_MESSAGES.resent);

    // The newest link works.
    await page.goto(await confirmationLink(account.email, 3));
    await expect(page).toHaveURL(/\/account$/);
  });

  test("sign-up shows field errors and keeps what was typed", async ({ page }) => {
    await page.goto("/sign-up");
    await fillSignUp(page, { email: "not-an-email", password: "short", displayName: "visit bob.com" });
    await expect(page.getByText("Enter an email address like name@example.com.")).toBeVisible();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
    await expect(page.getByText("Display names can't include links.")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue("not-an-email");
    await expect(page.getByLabel("Display name")).toHaveValue("visit bob.com");
    await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  });

  test("a used or broken confirmation link explains what to do", async ({ page }) => {
    await page.goto("/auth/confirm?token_hash=not-a-token&type=email&next=%2Faccount");
    await expect(page).toHaveURL(/\/sign-in\?error=link$/);
    await expect(main(page).getByRole("alert")).toHaveText(AUTH_MESSAGES.linkInvalid);
  });

  test("a network failure keeps the form and says so", async ({ page }) => {
    await page.goto("/sign-in");
    await page.route("**/sign-in**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
    await signIn(page, { email: "someone@example.test", password: "whatever-password" });
    await expect(main(page).getByRole("alert")).toHaveText(AUTH_MESSAGES.network);
    await expect(page.getByLabel("Email")).toHaveValue("someone@example.test");
  });

  test("signed-in members skip the sign-in and sign-up pages", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("skip"));
    await page.goto("/sign-in");
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/sign-up");
    await expect(page).toHaveURL(/\/account$/);
  });
});

test.describe("auth accessibility", () => {
  for (const path of ["/sign-up", "/sign-in"]) {
    test(`${path} has no axe violations, including with errors shown`, async ({ page }) => {
      await page.goto(path);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.getByRole("button", { name: path === "/sign-up" ? "Create account" : "Sign in" }).click();
      await expect(page.getByText(/Enter your email address/)).toBeVisible();
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test("/account has no axe violations", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("axe"));
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
