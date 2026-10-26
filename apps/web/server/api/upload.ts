import { createHash, randomUUID } from "node:crypto";
import {
  OFFER_LIMITS,
  PHOTO_MESSAGES,
  PhotoUploadFieldsSchema,
  SIGNATURE_BYTES,
  checkPhotoFile,
} from "@batr/shared";
import { processPhoto, UnreadablePhotoError } from "@/server/photos/process";
import { deleteQueuedFiles } from "@/server/storage/deleter";
import { requireId, requireIdempotencyKey, requireMember, type ApiCaller } from "./auth";
import { checkOrFail } from "./body";
import { callFunction, ownerOfferView, toApiError } from "./db";
import { ApiError, ok } from "./respond";
import { BUCKET, type OfferRow } from "./views";

// POST /api/v1/offers/:id/photos (milestone-1.md, Photos and
// Concurrency 6). Order: sign-in, key, file checks, key lookup, image
// processing (no lock held), upload of the two WebP files with the
// member's own session (storage policies apply), then the database step
// that locks the offer and adds the row. Files left behind by a failed
// or replayed database step are queued and deleted.

const ENDPOINT = "POST /api/v1/offers/:id/photos";
/** Room for the multipart envelope around a 10 MB photo. */
const MAX_REQUEST_BYTES = OFFER_LIMITS.photoMaxBytes + 64 * 1024;
const PHOTO_CACHE_SECONDS = "600"; // no longer than the link lifetime (Caching)

const tooLarge = () => new ApiError("VALIDATION_FAILED", { message: PHOTO_MESSAGES.tooLarge, fields: { file: PHOTO_MESSAGES.tooLarge } });

async function readForm(request: Request): Promise<{ file: File; fields: Record<string, string> }> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_REQUEST_BYTES) throw tooLarge();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("VALIDATION_FAILED", { fields: { file: "Send the photo as multipart form data." } });
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("VALIDATION_FAILED", { fields: { file: "Choose a photo." } });
  const fields: Record<string, string> = {};
  for (const [name, value] of form.entries()) if (name !== "file" && typeof value === "string") fields[name] = value;
  return { file, fields };
}

/** SHA-256 of the file bytes plus the fields, for the idempotency check. */
function requestHash(bytes: Uint8Array, fields: object): string {
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  return createHash("sha256").update(fileHash).update(JSON.stringify(fields)).digest("hex");
}

async function uploadFiles(caller: ApiCaller, paths: string[], files: Buffer[]): Promise<{ uploaded: string[]; refused: boolean }> {
  const uploaded: string[] = [];
  for (const [i, path] of paths.entries()) {
    const { error } = await caller.client.storage
      .from(BUCKET)
      .upload(path, files[i] as Buffer, { contentType: "image/webp", cacheControl: PHOTO_CACHE_SECONDS, upsert: false });
    if (error) {
      // A policy refusal (offer not the member's, or closed) is answered by
      // the database step below with the precise error.
      const status = Number((error as { statusCode?: string | number }).statusCode ?? 0);
      if (status === 400 || status === 403 || status === 404) return { uploaded, refused: true };
      throw error;
    }
    uploaded.push(path);
  }
  return { uploaded, refused: false };
}

async function abandon(caller: ApiCaller, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await caller.client.rpc("offer_photo_files_abandon", { p_paths: paths });
  if (error) {
    console.error("Could not queue abandoned upload files", error);
    return;
  }
  await deleteQueuedFiles(paths);
}

export async function uploadPhoto(request: Request, offerId: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const id = requireId(offerId);
  const { file, fields: rawFields } = await readForm(request);
  const fields = checkOrFail(PhotoUploadFieldsSchema, rawFields);

  if (file.size > OFFER_LIMITS.photoMaxBytes) throw tooLarge();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkPhotoFile({ size: bytes.length, header: bytes.subarray(0, SIGNATURE_BYTES), type: file.type, name: file.name });
  if (!check.ok) throw new ApiError(check.code, { message: check.message, fields: { file: check.message } });

  const hash = requestHash(bytes, fields);
  const stored = await callFunction<OfferRow | null>(caller, "offer_idempotent_response", {
    p_key: key,
    p_endpoint: ENDPOINT,
    p_resource_id: id,
    p_request_hash: hash,
  });
  if (stored) return ok(await ownerOfferView(caller, stored), 201);

  let processed;
  try {
    processed = await processPhoto(bytes);
  } catch (error) {
    if (error instanceof UnreadablePhotoError) {
      throw new ApiError("UNSUPPORTED_FORMAT", { message: PHOTO_MESSAGES.unsupported, fields: { file: PHOTO_MESSAGES.unsupported } });
    }
    throw error;
  }

  const photoId = randomUUID();
  const paths = [`${caller.user.id}/${id}/${photoId}-display.webp`, `${caller.user.id}/${id}/${photoId}-thumb.webp`];
  let uploaded: string[] = [];
  let refused = false;
  try {
    ({ uploaded, refused } = await uploadFiles(caller, paths, [processed.display, processed.thumb]));
  } catch (error) {
    await abandon(caller, uploaded);
    throw error;
  }

  const { data, error } = await caller.client.rpc("offer_photo_add", {
    p_offer_id: id,
    p_expected_status: fields.expected_status,
    p_expected_revision: fields.expected_revision,
    p_photo_id: photoId,
    p_width: processed.width,
    p_height: processed.height,
    p_request_hash: hash,
    p_alt_text: fields.alt_text,
    p_idempotency_key: key,
  });
  if (error) {
    await abandon(caller, uploaded);
    const apiError = await toApiError(error, caller);
    // Storage refused the files although the offer checks passed: not
    // something the member can fix.
    if (refused && apiError.code === "VALIDATION_FAILED" && apiError.extra.fields && "photo" in apiError.extra.fields) {
      throw new ApiError("INTERNAL");
    }
    throw apiError;
  }
  const row = data as OfferRow;
  // A concurrent attempt with the same key finished first: the database
  // returned its response and queued this attempt's files.
  if (!(row.photos ?? []).some((photo) => photo.id === photoId)) await deleteQueuedFiles(uploaded);
  return ok(await ownerOfferView(caller, row), 201);
}
