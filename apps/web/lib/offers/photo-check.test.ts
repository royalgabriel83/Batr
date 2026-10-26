import { describe, expect, it } from "vitest";
import { OFFER_LIMITS, PHOTO_MESSAGES } from "@batr/shared";
import { checkChosenPhoto } from "./photo-check";

const file = (bytes: number[], name: string, type: string, size?: number) => {
  const body = new Uint8Array(size ?? Math.max(bytes.length, 16));
  body.set(bytes);
  return new File([body], name, { type });
};
const jpeg = [0xff, 0xd8, 0xff, 0xe0];
const heic = [0, 0, 0, 0x18, ...[..."ftypheic"].map((c) => c.charCodeAt(0))];
const pdf = [..."%PDF-1.7"].map((c) => c.charCodeAt(0));

describe("checkChosenPhoto", () => {
  it("accepts a JPEG", async () => {
    expect(await checkChosenPhoto(file(jpeg, "a.jpg", "image/jpeg"))).toEqual({ ok: true, format: "jpeg" });
  });
  it("refuses HEIC by signature even when named .jpg", async () => {
    expect(await checkChosenPhoto(file(heic, "IMG_1.jpg", "image/jpeg"))).toMatchObject({ ok: false, message: PHOTO_MESSAGES.heic });
  });
  it("refuses HEIC by name or type", async () => {
    expect(await checkChosenPhoto(file(jpeg, "IMG_1.HEIC", ""))).toMatchObject({ ok: false, message: PHOTO_MESSAGES.heic });
  });
  it("refuses a renamed PDF and a file over 10 MB", async () => {
    expect(await checkChosenPhoto(file(pdf, "photo.jpg", "image/jpeg"))).toMatchObject({ ok: false, message: PHOTO_MESSAGES.unsupported });
    expect(await checkChosenPhoto(file(jpeg, "big.jpg", "image/jpeg", OFFER_LIMITS.photoMaxBytes + 1))).toMatchObject({ ok: false, message: PHOTO_MESSAGES.tooLarge });
  });
});
