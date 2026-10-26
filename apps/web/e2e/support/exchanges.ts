import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";
import { newAccount, signUpAndConfirm, type TestAccount } from "./auth";
import { jpegPhoto } from "./offers";

// Setup for the proposal and agreement journeys: offers and agreements
// made through the API with the member's own cookie session.

export const headers = (baseURL: string) => ({
  "Idempotency-Key": randomUUID(),
  Origin: baseURL,
});

/** Publishes an offer with one photo through the API with the member's cookie session; `extra` overrides the fields (a service, for example). */
export async function publish(
  request: APIRequestContext,
  baseURL: string,
  title: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const fields = {
    title,
    category: "electronics",
    condition: "good",
    offering_text: title,
    wants_text: "Something useful",
    description: "",
    ...extra,
  };
  const created = await request.post("/api/v1/offers", {
    headers: headers(baseURL),
    data: fields,
  });
  expect(created.status()).toBe(201);
  let offer = (
    (await created.json()) as {
      data: { id: string; status: string; revision: number };
    }
  ).data;
  const photo = await jpegPhoto("photo.jpg", { r: 40, g: 90, b: 160 });
  const uploaded = await request.post(`/api/v1/offers/${offer.id}/photos`, {
    headers: headers(baseURL),
    multipart: {
      file: {
        name: photo.name,
        mimeType: photo.mimeType,
        buffer: photo.buffer,
      },
      expected_status: offer.status,
      expected_revision: String(offer.revision),
    },
  });
  expect(uploaded.status()).toBe(201);
  offer = ((await uploaded.json()) as { data: typeof offer }).data;
  const published = await request.post(`/api/v1/offers/${offer.id}/publish`, {
    headers: headers(baseURL),
    data: { expected_status: offer.status, expected_revision: offer.revision },
  });
  expect(published.status()).toBe(200);
  return offer.id;
}

/**
 * The proposer offers `gives` and ₦20,000 for `target`; the owner
 * accepts. Returns the agreement's id.
 */
export async function agree(
  proposer: APIRequestContext,
  owner: APIRequestContext,
  baseURL: string,
  target: string,
  gives: string,
): Promise<string> {
  const sent = await proposer.post("/api/v1/proposals", {
    headers: headers(baseURL),
    data: {
      offer_id: target,
      gives: [{ kind: "offer", offer_id: gives }],
      gets: [{ kind: "offer", offer_id: target }],
      cash: { amount_naira: 20000, payer: "proposer" },
    },
  });
  expect(sent.status()).toBe(201);
  const proposal = ((await sent.json()) as {
    data: { id: string; latest_revision_id: string };
  }).data;
  const accepted = await owner.post(
    `/api/v1/proposals/${proposal.id}/accept`,
    {
      headers: headers(baseURL),
      data: { revision_id: proposal.latest_revision_id },
    },
  );
  expect(accepted.status()).toBe(200);
  return ((await accepted.json()) as { data: { agreement_id: string } }).data
    .agreement_id;
}

export async function axeBlocking(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
}

export async function noSideScroll(page: Page) {
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
}

export async function member(
  browser: Browser,
  baseURL: string,
  label: string,
  width: number,
): Promise<{ page: Page; account: TestAccount }> {
  const page = await (
    await browser.newContext({ baseURL, viewport: { width, height: 900 } })
  ).newPage();
  const account = await signUpAndConfirm(page, newAccount(label));
  return { page, account };
}
