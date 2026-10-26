import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";

// Helpers for auth journeys against the real local Supabase. Emails are
// read from the local inbox (Mailpit), never sent anywhere.

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";

export interface TestAccount {
  email: string;
  password: string;
  displayName: string;
}

export function newAccount(label = "member"): TestAccount {
  const id = randomUUID().slice(0, 8);
  return { email: `${label}-${id}@example.test`, password: `pw-${randomUUID()}`, displayName: `${label} ${id}` };
}

interface MailpitSummary {
  ID: string;
}

/** All confirmation emails sent to `email`, newest first. */
export async function inbox(email: string): Promise<MailpitSummary[]> {
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
  expect(response.ok).toBe(true);
  return ((await response.json()) as { messages: MailpitSummary[] }).messages;
}

/** The link in the newest email to `email`, waiting until `count` emails have arrived. */
async function newestLink(email: string, count: number, subject: string): Promise<string> {
  await expect.poll(async () => (await inbox(email)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(count);
  const [latest] = await inbox(email);
  if (!latest) throw new Error(`No email for ${email}`);
  const message = (await (await fetch(`${MAILPIT}/api/v1/message/${latest.ID}`)).json()) as { HTML: string; Subject: string };
  expect(message.Subject).toBe(subject);
  const href = /href="([^"]+)"/.exec(message.HTML)?.[1];
  if (!href) throw new Error(`The email "${subject}" has no link`);
  return href.replaceAll("&amp;", "&");
}

/** The confirmation link in the newest email to `email`, waiting for it to arrive. */
export const confirmationLink = (email: string, count = 1): Promise<string> =>
  newestLink(email, count, "Confirm your BATR email");

/** The password-reset link in the newest email to `email`; `count` includes the confirmation email. */
export const resetLink = (email: string, count = 2): Promise<string> => newestLink(email, count, "Reset your BATR password");

export async function fillSignUp(page: Page, account: TestAccount): Promise<void> {
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByLabel("Display name").fill(account.displayName);
  await page.getByRole("button", { name: "Create account" }).click();
}

export async function signIn(page: Page, account: Pick<TestAccount, "email" | "password">): Promise<void> {
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Signs up through the UI and opens the confirmation link: the member is then signed in. */
export async function signUpAndConfirm(page: Page, account = newAccount()): Promise<TestAccount> {
  await page.goto("/sign-up");
  await fillSignUp(page, account);
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.goto(await confirmationLink(account.email));
  await expect(page).toHaveURL(/\/account$/);
  return account;
}

export async function signOut(page: Page): Promise<void> {
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
}
