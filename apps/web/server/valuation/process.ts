import sharp from "sharp";

// Evidence images are re-encoded as WebP so hidden data (GPS location,
// camera details) is never stored; the camera's rotation is applied.
// The original upload is never stored.

const LONGEST_SIDE = 2000;
const MAX_INPUT_PIXELS = 100_000_000;

export class UnreadableEvidenceError extends Error {}

export async function processEvidenceImage(input: Uint8Array): Promise<Buffer> {
  try {
    const { format } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    if (!format || !["jpeg", "png", "webp"].includes(format)) throw new UnreadableEvidenceError(String(format));
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: LONGEST_SIDE, height: LONGEST_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    throw new UnreadableEvidenceError("The image could not be read.");
  }
}
