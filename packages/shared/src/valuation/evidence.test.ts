import { describe, expect, it } from "vitest";
import { checkEvidenceFile, isSensitiveEvidence, pdfHasActiveContent } from "./evidence.ts";

const bytes = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("evidence files", () => {
  it("accepts images for photos and documents, and refuses PDFs while they are off", () => {
    expect(checkEvidenceFile("photo", { size: 100, header: JPEG })).toEqual({ ok: true, format: "jpeg" });
    // PDFs are off until malware scanning exists (owner, 2026-10-18).
    expect(checkEvidenceFile("receipt", { size: 100, header: bytes("%PDF-1.7\n") })).toEqual({
      ok: false, code: "UNSUPPORTED_FORMAT", message: "BATR isn't accepting PDF files yet. Upload a photo or screenshot of the document instead (JPEG, PNG or WebP).",
    });
    expect(checkEvidenceFile("photo", { size: 100, header: bytes("%PDF-1.7\n") })).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT" });
    expect(checkEvidenceFile("receipt", { size: 100, header: bytes("<html><body>") })).toMatchObject({ ok: false });
  });

  it("refuses files over 10 MB", () => {
    expect(checkEvidenceFile("receipt", { size: 10 * 1024 * 1024 + 1, header: JPEG })).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
  });

  it("spots scripts, launch actions and attached files in PDFs", () => {
    expect(pdfHasActiveContent(bytes("%PDF-1.4 1 0 obj << /Type /Catalog >> endobj"))).toBe(false);
    expect(pdfHasActiveContent(bytes("%PDF-1.4 << /S /JavaScript /JS (app.alert(1)) >>"))).toBe(true);
    expect(pdfHasActiveContent(bytes("%PDF-1.4 << /S /Launch /F (cmd.exe) >>"))).toBe(true);
    expect(pdfHasActiveContent(bytes("%PDF-1.4 << /Type /EmbeddedFile >>"))).toBe(true);
    expect(pdfHasActiveContent(bytes("%PDF-1.4 << /JSON 1 >>"))).toBe(false);
  });

  it("treats receipts and similar documents as sensitive", () => {
    expect(isSensitiveEvidence("receipt")).toBe(true);
    expect(isSensitiveEvidence("photo")).toBe(false);
  });
});
