import { SIGNATURE_BYTES, checkPhotoFile, type PhotoFileCheck } from "@batr/shared";

// The browser's check of a chosen photo, before anything is uploaded
// (milestone-1.md, Photos): HEIC by type, name or signature, then size,
// then any other unrecognised file. The API checks again.

export async function checkChosenPhoto(file: Blob & { name?: string }): Promise<PhotoFileCheck> {
  const header = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  return checkPhotoFile({ size: file.size, header, type: file.type, name: file.name });
}
