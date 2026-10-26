import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PUBLISH_RULE_MESSAGES } from "@batr/shared";
import { newAccount, signUpAndConfirm } from "./support/auth";
import { offerIdFrom } from "./support/offers";

// Unit 07 review: leaving the offer form with unsaved changes, and
// getting typed values back (02-offer-creation.md, journey step 7 and
// Failure cases; milestone-1.md, Error states).

const header = (page: Page) => page.getByRole("banner");
const leaveDialog = (page: Page) => page.getByRole("dialog", { name: "Leave without saving?" });

/** Types like a person, so the browser counts it as interaction (needed for the leave warning). */
async function typeInto(page: Page, label: string, text: string) {
  const field = page.getByLabel(label);
  await field.click();
  await field.press("ControlOrMeta+a");
  await page.keyboard.type(text);
}

async function savedDraft(page: Page, title: string): Promise<string> {
  await page.goto("/offers/new");
  await typeInto(page, "Title", title);
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();
  return offerIdFrom(page);
}

test.describe("leaving the offer form", () => {
  test("following a BATR link with unsaved changes asks first; Stay keeps the typing", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("leavelink"));
    await page.goto("/offers/new");
    await typeInto(page, "Title", "Camping stove");

    await header(page).getByRole("link", { name: "My offers" }).click();
    await expect(leaveDialog(page)).toBeVisible();
    await expect(page).toHaveURL(/\/offers\/new$/);
    await leaveDialog(page).getByRole("button", { name: "Stay on this page" }).click();
    await expect(leaveDialog(page)).toBeHidden();
    await expect(page.getByLabel("Title")).toHaveValue("Camping stove");

    await header(page).getByRole("link", { name: "My offers" }).click();
    await leaveDialog(page).getByRole("button", { name: "Leave without saving" }).click();
    await expect(page).toHaveURL(/\/my-offers$/);
    // Leaving on purpose discards the typing: coming back starts clean.
    await page.goto("/offers/new");
    await expect(page.getByLabel("Title")).toHaveValue("");
  });

  test("links are not interrupted when everything is saved", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("leavesaved"));
    await savedDraft(page, "Picnic blanket");
    await header(page).getByRole("link", { name: "My offers" }).click();
    await expect(page).toHaveURL(/\/my-offers$/);
  });

  test("refreshing with unsaved changes warns, and the typing comes back after the refresh", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("leavereload"));
    const id = await savedDraft(page, "Rice cooker");
    await typeInto(page, "Title", "Rice cooker, 1.8 litres");

    const warned = new Promise<string>((resolve) => {
      page.once("dialog", (dialog) => {
        resolve(dialog.type());
        void dialog.accept();
      });
    });
    await page.reload();
    expect(await warned).toBe("beforeunload");
    await expect(page).toHaveURL(new RegExp(`/offers/${id}/edit$`));
    await expect(page.getByText("We restored the changes you hadn't saved.")).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("Rice cooker, 1.8 litres");

    // The member can throw the restored typing away.
    await page.getByRole("button", { name: "Discard restored changes" }).click();
    await expect(page.getByLabel("Title")).toHaveValue("Rice cooker");
  });

  test("closing the tab with unsaved changes warns", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("leaveclose"));
    await page.goto("/offers/new");
    await typeInto(page, "Title", "Tent pegs");
    const warned = new Promise<string>((resolve) => {
      page.once("dialog", (dialog) => {
        resolve(dialog.type());
        void dialog.dismiss();
      });
    });
    await page.close({ runBeforeUnload: true });
    expect(await warned).toBe("beforeunload");
  });

  test("going back and then forward again brings the typing back", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("leaveback"));
    const id = await savedDraft(page, "Garden chair");
    await page.goto("/my-offers");
    await page.getByRole("link", { name: "Edit Garden chair" }).click();
    await expect(page).toHaveURL(new RegExp(`/offers/${id}/edit$`));
    await typeInto(page, "What you'd like in return", "Plant pots");

    await page.goBack();
    await expect(page).toHaveURL(/\/my-offers$/);
    await page.goForward();
    await expect(page).toHaveURL(new RegExp(`/offers/${id}/edit$`));
    await expect(page.getByLabel("What you'd like in return")).toHaveValue("Plant pots");
    await expect(page.getByText("We restored the changes you hadn't saved.")).toBeVisible();
  });

  test("typing restored after the offer changed elsewhere is shown against the latest version", async ({ page, baseURL }) => {
    await signUpAndConfirm(page, newAccount("leavestale"));
    const id = await savedDraft(page, "Bread maker");
    await typeInto(page, "Title", "Bread maker with manual");

    // Another device saves a different title in the meantime.
    const current = (await (await page.request.get(`/api/v1/offers/${id}`)).json()) as { data: { revision: number } };
    const changed = await page.request.patch(`/api/v1/offers/${id}`, {
      headers: { "Idempotency-Key": randomUUID(), Origin: baseURL as string },
      data: { expected_revision: current.data.revision, expected_status: "draft", fields: { title: "Bread machine" } },
    });
    expect(changed.status()).toBe(200);

    page.once("dialog", (dialog) => void dialog.accept());
    await page.reload();
    await expect(page.getByRole("alert").getByText(/changed in another window or device/)).toBeVisible();
    await expect(page.getByText("Latest saved title: Bread machine")).toBeVisible();
    await expect(page.getByLabel("Title")).toHaveValue("Bread maker with manual");
  });

  test("publishing from the preview with missing details returns to the form and focuses the first problem", async ({ page }) => {
    await signUpAndConfirm(page, newAccount("previewerr"));
    await page.goto("/offers/new");
    await typeInto(page, "Title", "Kite");
    // Exact: the account menu button carries the member's name, which here contains "preview".
    await page.getByRole("button", { name: "Preview", exact: true }).click();
    await page.getByRole("button", { name: "Publish offer" }).click();
    await expect(page.getByText(PUBLISH_RULE_MESSAGES.category)).toBeVisible();
    await expect(page.locator("#photos-add")).toBeFocused();
  });
});

test("My offers actions have a touch target of at least 44 by 44 pixels on a phone", async ({ page }) => {
  await signUpAndConfirm(page, newAccount("targets"));
  await savedDraft(page, "Hiking poles");
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/my-offers");
  for (const name of ["Edit Hiking poles", "Delete Hiking poles"]) {
    const target = page.getByRole(name.startsWith("Edit") ? "link" : "button", { name });
    const size = await target.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const before = getComputedStyle(element, "::before");
      const extra = before.content !== "none" && before.position === "absolute" ? Number.parseFloat(before.height) : 0;
      return { width: box.width, height: Math.max(box.height, extra) };
    });
    expect(size.width, name).toBeGreaterThanOrEqual(44);
    expect(size.height, name).toBeGreaterThanOrEqual(44);
  }
});
