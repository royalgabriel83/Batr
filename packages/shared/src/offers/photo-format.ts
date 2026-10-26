import { OFFER_LIMITS } from "./constants.ts";

// Photo file rules from specs/milestone-1.md (Photos, D8 option A):
// JPEG, PNG and WebP only, at most 10 MB, checked by file signature.
// The browser runs this before uploading and the API runs it again.

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export type ImageFormat = "jpeg" | "png" | "webp" | "heic" | "unknown";
export type AcceptedImageFormat = Exclude<ImageFormat, "heic" | "unknown">;

/** Bytes needed from the start of a file to detect its format. */
export const SIGNATURE_BYTES = 12;

export const PHOTO_MESSAGES = {
  heic: "This photo is in HEIC format, which BATR doesn't support yet. Please choose a JPEG, PNG or WebP photo.",
  unsupported: "This file isn't a supported photo. Please choose a JPEG, PNG or WebP photo.",
  tooLarge: "This photo is larger than 10 MB. Please choose a smaller photo.",
} as const;

// ISO base media "ftyp" brands used by HEIC and HEIF images.
const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"]);

const ascii = (bytes: Uint8Array, start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

export function detectImageFormat(bytes: Uint8Array): ImageFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) {
    return "png";
  }
  if (bytes.length >= SIGNATURE_BYTES && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "webp";
  if (bytes.length >= SIGNATURE_BYTES && ascii(bytes, 4, 8) === "ftyp" && HEIF_BRANDS.has(ascii(bytes, 8, 12))) {
    return "heic";
  }
  return "unknown";
}

/** HEIC by declared type or file name, for the browser's first check. */
export function looksLikeHeic(type: string, name: string): boolean {
  return /^image\/hei[cf]/i.test(type) || /\.hei[cf]$/i.test(name);
}

export type PhotoFileCheck =
  | { ok: true; format: AcceptedImageFormat }
  | { ok: false; code: "UNSUPPORTED_FORMAT" | "VALIDATION_FAILED"; message: string };

/**
 * Checks one photo file. `header` is at least the first SIGNATURE_BYTES
 * bytes; `type` and `name` are optional hints. HEIC is reported first
 * (it has its own message), then size, then any other unrecognised
 * signature.
 */
export function checkPhotoFile(file: { size: number; header: Uint8Array; type?: string; name?: string }): PhotoFileCheck {
  const format = detectImageFormat(file.header);
  if (format === "heic" || looksLikeHeic(file.type ?? "", file.name ?? "")) {
    return { ok: false, code: "UNSUPPORTED_FORMAT", message: PHOTO_MESSAGES.heic };
  }
  if (file.size > OFFER_LIMITS.photoMaxBytes) {
    return { ok: false, code: "VALIDATION_FAILED", message: PHOTO_MESSAGES.tooLarge };
  }
  if (format === "unknown") return { ok: false, code: "UNSUPPORTED_FORMAT", message: PHOTO_MESSAGES.unsupported };
  return { ok: true, format };
}

/**
 * Lifetime of signed photo links (D5, decided 2026-10-15). Tests read
 * this value instead of a fixed number.
 */
export const PHOTO_LINK_TTL_SECONDS = 600;
