import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { newAccount, signUpAndConfirm } from "./support/auth";

// The offer API through the real server with the web app's session
// cookie (the integration suite covers every endpoint with Bearer
// tokens in-process; see tests/api).

test.describe("offer API over HTTP", () => {
  test("cookie session: signed out 401, signed in creates and lists; other sites are refused", async ({ page, baseURL }) => {
    expect((await page.request.get("/api/v1/me/offers")).status()).toBe(401);
    await signUpAndConfirm(page, newAccount("api"));

    const created = await page.request.post("/api/v1/offers", {
      headers: { "Idempotency-Key": randomUUID(), Origin: baseURL as string },
      data: { title: "Camping stove" },
    });
    expect(created.status()).toBe(201);
    expect(created.headers()["cache-control"]).toBe("private, no-store");
    const offer = (await created.json()).data as { id: string; title: string };

    const mine = await page.request.get("/api/v1/me/offers?status=draft");
    expect(((await mine.json()).data.offers as { id: string }[]).map((o) => o.id)).toEqual([offer.id]);

    const foreign = await page.request.post("/api/v1/offers", {
      headers: { "Idempotency-Key": randomUUID(), Origin: "https://evil.example" },
      data: { title: "Not mine" },
    });
    expect(foreign.status()).toBe(403);

    // The draft is invisible to a signed-out visitor.
    const visitor = await page.context().browser()?.newContext({ baseURL });
    expect((await visitor?.request.get(`/api/v1/offers/${offer.id}`))?.status()).toBe(404);
    await visitor?.close();
  });

  test("cookie session: another member cannot read or change someone else's draft", async ({ browser, baseURL }) => {
    const owner = await browser.newContext({ baseURL });
    const ownerPage = await owner.newPage();
    await signUpAndConfirm(ownerPage, newAccount("api-owner"));
    const created = await ownerPage.request.post("/api/v1/offers", {
      headers: { "Idempotency-Key": randomUUID(), Origin: baseURL as string },
      data: { title: "Owner's draft" },
    });
    expect(created.status()).toBe(201);
    const offer = (await created.json()).data as { id: string; revision: number };
    const seen = { expected_revision: offer.revision, expected_status: "draft" };

    const other = await browser.newContext({ baseURL });
    const otherPage = await other.newPage();
    await signUpAndConfirm(otherPage, newAccount("api-other"));
    const write = { "Idempotency-Key": randomUUID(), Origin: baseURL as string };
    expect((await otherPage.request.get(`/api/v1/offers/${offer.id}`)).status()).toBe(404);
    expect(
      (await otherPage.request.patch(`/api/v1/offers/${offer.id}`, {
        headers: write,
        data: { ...seen, fields: { title: "Taken" } },
      })).status(),
    ).toBe(404);
    expect(
      (await otherPage.request.delete(`/api/v1/offers/${offer.id}`, {
        headers: { ...write, "Idempotency-Key": randomUUID() },
        data: seen,
      })).status(),
    ).toBe(404);

    const still = await ownerPage.request.get(`/api/v1/offers/${offer.id}`);
    expect(((await still.json()).data as { title: string }).title).toBe("Owner's draft");
    await owner.close();
    await other.close();
  });

  test("the service key is not in any browser file", () => {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const key = /^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m.exec(env)?.[1]?.trim();
    expect(key && key.length > 20).toBe(true);
    const root = new URL("../.next/static", import.meta.url).pathname;
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(file, "utf8").includes(key as string), file).toBe(false);
  });
});
