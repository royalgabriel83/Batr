import { describe, expect, it } from "vitest";
import { PHOTO_MESSAGES, checkPhotoFile, detectImageFormat, looksLikeHeic } from "./photo-format.ts";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], [0, 0x10], "JFIF", [0, 1]);
const PNG = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], [0, 0, 0, 0x0d]);
const WEBP = bytes("RIFF", [0x24, 0, 0, 0], "WEBP");
const HEIC = bytes([0, 0, 0, 0x18], "ftyp", "heic");
const HEIF = bytes([0, 0, 0, 0x18], "ftyp", "mif1");
const PDF = bytes("%PDF-1.7\n%", [0xe2, 0xe3]);
const MP4 = bytes([0, 0, 0, 0x18], "ftyp", "isom");
const MB = 1024 * 1024;

describe("detectImageFormat", () => {
  it("recognises JPEG, PNG, WebP and HEIC by signature", () => {
    expect(detectImageFormat(JPEG)).toBe("jpeg");
    expect(detectImageFormat(PNG)).toBe("png");
    expect(detectImageFormat(WEBP)).toBe("webp");
    expect(detectImageFormat(HEIC)).toBe("heic");
    expect(detectImageFormat(HEIF)).toBe("heic");
  });

  it("does not recognise anything else, or a header that is too short", () => {
    expect(detectImageFormat(PDF)).toBe("unknown");
    expect(detectImageFormat(MP4)).toBe("unknown");
    expect(detectImageFormat(bytes("RIFF", [0, 0, 0, 0], "WAVE"))).toBe("unknown");
    expect(detectImageFormat(bytes([0xff, 0xd8]))).toBe("unknown");
    expect(detectImageFormat(new Uint8Array())).toBe("unknown");
  });
});

describe("checkPhotoFile", () => {
  it("accepts JPEG, PNG and WebP up to 10 MB", () => {
    expect(checkPhotoFile({ size: 10 * MB, header: JPEG })).toEqual({ ok: true, format: "jpeg" });
    expect(checkPhotoFile({ size: 1, header: PNG, type: "image/png", name: "a.png" })).toEqual({ ok: true, format: "png" });
    expect(checkPhotoFile({ size: 1, header: WEBP })).toEqual({ ok: true, format: "webp" });
  });

  it("rejects a 12 MB image (acceptance criterion 7)", () => {
    expect(checkPhotoFile({ size: 12 * MB, header: JPEG })).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      message: PHOTO_MESSAGES.tooLarge,
    });
  });

  it("rejects a PDF renamed to .jpg, going by its signature (acceptance criterion 7)", () => {
    expect(checkPhotoFile({ size: MB, header: PDF, type: "image/jpeg", name: "photo.jpg" })).toEqual({
      ok: false,
      code: "UNSUPPORTED_FORMAT",
      message: PHOTO_MESSAGES.unsupported,
    });
  });

  it("rejects HEIC by signature, type or name, with the HEIC message (acceptance criterion 30)", () => {
    const heic = { ok: false, code: "UNSUPPORTED_FORMAT", message: PHOTO_MESSAGES.heic };
    expect(checkPhotoFile({ size: MB, header: HEIC, type: "image/jpeg", name: "IMG_1.jpg" })).toEqual(heic);
    expect(checkPhotoFile({ size: MB, header: new Uint8Array(), type: "image/heic", name: "x" })).toEqual(heic);
    expect(checkPhotoFile({ size: 20 * MB, header: new Uint8Array(), name: "IMG_2.HEIF" })).toEqual(heic);
    expect(PHOTO_MESSAGES.heic).toBe(
      "This photo is in HEIC format, which BATR doesn't support yet. Please choose a JPEG, PNG or WebP photo.",
    );
  });

  it("detects HEIC from a declared type or file name", () => {
    expect(looksLikeHeic("image/heif-sequence", "")).toBe(true);
    expect(looksLikeHeic("image/jpeg", "holiday.heic")).toBe(true);
    expect(looksLikeHeic("image/jpeg", "heic.jpg")).toBe(false);
  });
});
