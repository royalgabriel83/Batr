import sharp from "sharp";

// Photo processing (milestone-1.md, Photos): every upload is re-encoded
// so no hidden data (GPS location, camera details) is stored, the
// camera's rotation is applied, and two WebP sizes are produced. The
// original upload is never stored.

export const DISPLAY_LONGEST_SIDE = 1600;
// 800 so card and list photos stay sharp on 2x and 3x screens (owner, 2026-10-17).
export const THUMB_LONGEST_SIDE = 800;
/** The bucket accepts at most 2 MB per file. */
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
/** Refuses images that would need an unreasonable amount of memory to decode. */
const MAX_INPUT_PIXELS = 100_000_000;

export interface ProcessedPhoto {
  display: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

export class UnreadablePhotoError extends Error {}

const ACCEPTED = new Set(["jpeg", "png", "webp"]);

async function encode(input: Uint8Array, longestSide: number, quality: number) {
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
    .rotate() // applies the stored orientation, then the orientation tag is gone
    .resize({ width: longestSide, height: longestSide, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true }); // no withMetadata(): all metadata is dropped
}

export async function processPhoto(input: Uint8Array): Promise<ProcessedPhoto> {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new UnreadablePhotoError("The image could not be read.");
  }
  // The signature check already ran; this also refuses anything the
  // decoder sees differently (sharp itself can read HEIC, BATR does not).
  if (!format || !ACCEPTED.has(format)) throw new UnreadablePhotoError(`Unsupported format: ${String(format)}`);
  try {
    let display = await encode(input, DISPLAY_LONGEST_SIDE, 82);
    if (display.data.length > MAX_OUTPUT_BYTES) display = await encode(input, DISPLAY_LONGEST_SIDE, 60);
    const thumb = await encode(input, THUMB_LONGEST_SIDE, 78);
    return { display: display.data, thumb: thumb.data, width: display.info.width, height: display.info.height };
  } catch {
    throw new UnreadablePhotoError("The image could not be processed.");
  }
}
