import { expect, type Browser, type Page } from "@playwright/test";
import sharp from "sharp";
import { OFFER_CONDITIONS } from "@batr/shared";

// Helpers for offer journeys. Photos are generated here; nothing is
// read from disk.

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export async function jpegPhoto(name = "photo.jpg", color = { r: 10, g: 120, b: 80 }): Promise<UploadFile> {
  const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: color } }).jpeg().toBuffer();
  return { name, mimeType: "image/jpeg", buffer };
}

/** A file whose bytes start like an iPhone HEIC photo. */
export function heicFile(name = "IMG_0001.HEIC"): UploadFile {
  const buffer = Buffer.alloc(64);
  buffer.write("\u0000\u0000\u0000\u0018ftypheic", 0, "latin1");
  return { name, mimeType: "image/heic", buffer };
}

/** A PDF renamed to look like a photo. */
export function renamedPdf(): UploadFile {
  return { name: "holiday.jpg", mimeType: "image/jpeg", buffer: Buffer.from("%PDF-1.7\n% not a photo\n") };
}

/** A JPEG signature padded past the 10 MB limit. */
export function oversizedJpeg(): UploadFile {
  const buffer = Buffer.alloc(12 * 1024 * 1024);
  buffer.set([0xff, 0xd8, 0xff, 0xe0]);
  return { name: "huge.jpg", mimeType: "image/jpeg", buffer };
}

export const savedPhotos = (page: Page) => page.locator("li[data-photo-id]");

export async function addPhotos(page: Page, files: UploadFile[]): Promise<void> {
  await page.locator("#photos-input").setInputFiles(files);
}

export interface OfferInput {
  title?: string;
  category?: string;
  condition?: string;
  offering?: string;
  wants?: string;
  description?: string;
}

export async function fillOffer(page: Page, input: OfferInput): Promise<void> {
  if (input.title !== undefined) await page.getByLabel("Title").fill(input.title);
  if (input.category) await page.getByLabel("Category").selectOption({ label: input.category });
  if (input.condition) {
    // The radio itself is visually hidden; members click its label.
    const id = Object.entries(OFFER_CONDITIONS).find(([, label]) => label === input.condition)?.[0];
    await page.locator(`label[for="condition-${String(id)}"]`).click();
  }
  if (input.description !== undefined) await page.getByLabel("Description").fill(input.description);
  if (input.offering !== undefined) await page.getByLabel("What you're offering").fill(input.offering);
  if (input.wants !== undefined) await page.getByLabel("What you'd like in return").fill(input.wants);
}

export const completeOffer = (title: string): OfferInput & { title: string } => ({
  title,
  category: "Sports and outdoors",
  condition: "Good",
  offering: `${title}, well looked after`,
  wants: "A two-person tent",
  description: "Collected in person.",
});

/** The offer id from an editor URL. */
export async function offerIdFrom(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/offers\/[0-9a-f-]{36}\/edit$/);
  return /\/offers\/([0-9a-f-]{36})\/edit/.exec(page.url())?.[1] as string;
}

/** Creates and publishes an offer through the UI; returns its id. */
export async function publishOffer(page: Page, title: string): Promise<string> {
  await page.goto("/offers/new");
  await fillOffer(page, completeOffer(title));
  await addPhotos(page, [await jpegPhoto()]);
  await expect(savedPhotos(page)).toHaveCount(1);
  const id = await offerIdFrom(page);
  await page.getByRole("button", { name: "Publish offer" }).click();
  await expect(page.getByRole("heading", { name: "Your offer is live" })).toBeVisible();
  return id;
}

/** What a signed-out visitor gets for an offer through the API. */
export async function visitorStatus(browser: Browser, baseURL: string, id: string): Promise<{ status: number; title?: string }> {
  const visitor = await browser.newContext({ baseURL });
  const response = await visitor.request.get(`/api/v1/offers/${id}`);
  const body = response.ok() ? ((await response.json()) as { data: { title: string } }).data : null;
  await visitor.close();
  return { status: response.status(), title: body?.title };
}

export const myOfferRow = (page: Page, title: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, level: 3 }) });
