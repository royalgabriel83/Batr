import { detectImageFormat, SIGNATURE_BYTES } from "../offers/photo-format.ts";
import { EVIDENCE_LIMITS, SENSITIVE_EVIDENCE_KINDS, VALUATION_POLICY, type EvidenceKind } from "./constants.ts";

// Evidence file rules (owner, 2026-10-17). Photos of the item must be
// JPEG, PNG or WebP; documents may also be PDF once PDFs are enabled
// (off until malware scanning exists, owner 2026-10-18). The browser runs these
// checks first and the API runs them again on the bytes. The server
// re-encodes every image (removing hidden data such as GPS location)
// and refuses PDFs that contain scripts, launch actions or embedded
// files. This is not a malware scanner: see specs/valuation-and-fees.md.

export const EVIDENCE_MESSAGES = {
  tooLarge: "This file is larger than 10 MB. Please choose a smaller file.",
  photoType: "Photos must be JPEG, PNG or WebP images.",
  documentType: VALUATION_POLICY.pdfUploadsEnabled ? "Upload a JPEG, PNG or WebP image, or a PDF." : "Upload a JPEG, PNG or WebP image.",
  pdfDisabled: "BATR isn't accepting PDF files yet. Upload a photo or screenshot of the document instead (JPEG, PNG or WebP).",
  unsafePdf: "This PDF contains scripts, actions or attached files, which BATR doesn't accept. Save it as a plain PDF or upload a photo of it.",
  redact: "Cover or remove anything personal you don't need to show, such as card numbers, account numbers, your home address or other people's names.",
} as const;

export type EvidenceFileFormat = "jpeg" | "png" | "webp" | "pdf";

export type EvidenceFileCheck = { ok: true; format: EvidenceFileFormat } | { ok: false; code: "UNSUPPORTED_FORMAT" | "VALIDATION_FAILED"; message: string };

const isPdf = (header: Uint8Array) =>
  header.length >= 5 && header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46 && header[4] === 0x2d;

/** Checks a file's size and signature for the evidence kind. */
export function checkEvidenceFile(kind: EvidenceKind, file: { size: number; header: Uint8Array }): EvidenceFileCheck {
  if (file.size > EVIDENCE_LIMITS.maxBytes) return { ok: false, code: "VALIDATION_FAILED", message: EVIDENCE_MESSAGES.tooLarge };
  const image = detectImageFormat(file.header.subarray(0, SIGNATURE_BYTES));
  if (image === "jpeg" || image === "png" || image === "webp") return { ok: true, format: image };
  if (kind !== "photo" && isPdf(file.header)) {
    return VALUATION_POLICY.pdfUploadsEnabled ? { ok: true, format: "pdf" } : { ok: false, code: "UNSUPPORTED_FORMAT", message: EVIDENCE_MESSAGES.pdfDisabled };
  }
  return { ok: false, code: "UNSUPPORTED_FORMAT", message: kind === "photo" ? EVIDENCE_MESSAGES.photoType : EVIDENCE_MESSAGES.documentType };
}

// PDF names that run code, open other programs or carry other files.
const UNSAFE_PDF_NAMES = ["/JavaScript", "/JS", "/Launch", "/EmbeddedFile", "/RichMedia", "/XFA"];

/** True when a PDF's bytes name an active-content feature BATR refuses. */
export function pdfHasActiveContent(bytes: Uint8Array): boolean {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return UNSAFE_PDF_NAMES.some((name) => new RegExp(`${name.replace("/", "\\/")}(?![A-Za-z])`).test(text));
}

export const isSensitiveEvidence = (kind: EvidenceKind): boolean => SENSITIVE_EVIDENCE_KINDS.includes(kind);
