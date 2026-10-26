"use client";

import { useId, useRef, useState } from "react";
import { FileText, ImageIcon, Lock, Upload } from "lucide-react";
import { EVIDENCE_KINDS, EVIDENCE_MESSAGES, VALUATION_POLICY, checkEvidenceFile, type EvidenceKind } from "@batr/shared";
import { Button, FormAlert, Select } from "@/components/ui";
import { fileSize } from "@/lib/valuation/format";
import { keyedRequest, openEvidence, uploadEvidenceFile } from "@/lib/valuation/client";
import type { EvidenceView, MemberValuation } from "@/lib/valuation/types";

export interface EvidenceListProps {
  valuationId: string;
  items: EvidenceView[];
  /** Kinds the member may choose when uploading; none means view only. */
  kinds?: readonly EvidenceKind[];
  componentId?: string | null;
  /** Saves pending form changes first, so the item exists before its files. */
  beforeUpload?: () => Promise<boolean>;
  onChange?: (valuation: MemberValuation) => void;
  /** Files can be removed only from a draft that was never sent. */
  removable?: boolean;
  label: string;
  hint?: string;
  error?: string;
}

/**
 * Evidence files for one item (or the whole valuation): what each is,
 * whether it is private, and a link that opens it for two minutes.
 * Uploads are checked in the browser first; the server checks again,
 * re-encodes images and refuses unsafe PDFs.
 */
export function EvidenceList({ valuationId, items, kinds = [], componentId = null, beforeUpload, onChange, removable = false, label, hint, error }: EvidenceListProps) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<EvidenceKind | "">(kinds.length === 1 ? (kinds[0] ?? "") : "");
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [send] = useState(keyedRequest);
  const photosOnly = kinds.length === 1 && kinds[0] === "photo";

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || !kind) return;
    setMessage(null);
    if (beforeUpload && !(await beforeUpload())) return;
    for (const file of Array.from(files)) {
      const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const check = checkEvidenceFile(kind, { size: file.size, header });
      if (!check.ok) {
        setMessage(`${file.name}: ${check.message}`);
        continue;
      }
      setProgress(0);
      const result = await uploadEvidenceFile<MemberValuation>(valuationId, file, kind, componentId, setProgress);
      setProgress(null);
      if (!result.ok) {
        setMessage(`${file.name}: ${result.error.fields?.file ?? result.error.message}`);
        continue;
      }
      onChange?.(result.data);
    }
    if (input.current) input.current.value = "";
  }

  async function remove(evidenceId: string) {
    setMessage(null);
    const result = await send<MemberValuation>(`remove-${evidenceId}`, `/api/v1/valuations/${valuationId}/evidence/${evidenceId}`, "DELETE");
    if (!result.ok) setMessage(result.error.message);
    else onChange?.(result.data);
  }

  async function view(evidenceId: string) {
    setMessage(await openEvidence(valuationId, evidenceId));
  }

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={hint ? `${id}-hint` : undefined}>
      <legend className="text-body-sm font-semibold">{label}</legend>
      {hint ? (
        <p id={`${id}-hint`} className="-mt-1 text-caption text-text-muted">
          {hint}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="flex flex-col divide-y divide-border-default rounded-lg border border-border-default">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              {item.mime === "application/pdf" ? (
                <FileText aria-hidden="true" className="size-5 text-text-muted" />
              ) : (
                <ImageIcon aria-hidden="true" className="size-5 text-text-muted" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-body-sm font-medium">{EVIDENCE_KINDS[item.kind]}</span>
                <span className="flex items-center gap-1 text-caption text-text-muted">
                  {fileSize(item.size_bytes)}
                  {item.sensitive ? (
                    <>
                      {" · "}
                      <Lock aria-hidden="true" className="size-3" /> Only you and BATR reviewers
                    </>
                  ) : null}
                </span>
              </span>
              <Button size="sm" variant="tertiary" onClick={() => void view(item.id)} aria-label={`Open ${EVIDENCE_KINDS[item.kind]}`}>
                Open
              </Button>
              {removable ? (
                <Button size="sm" variant="tertiary" onClick={() => void remove(item.id)} aria-label={`Remove ${EVIDENCE_KINDS[item.kind]}`}>
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {kinds.length > 0 ? (
        <div className="flex flex-wrap items-end gap-3">
          {kinds.length > 1 ? (
            <Select
              id={`${id}-kind`}
              label="What is it?"
              placeholder="Choose"
              value={kind}
              onChange={(event) => setKind(event.target.value as EvidenceKind)}
              options={kinds.map((value) => ({ value, label: EVIDENCE_KINDS[value] }))}
              className="min-w-48"
            />
          ) : null}
          <input
            ref={input}
            id={`${id}-file`}
            type="file"
            className="sr-only"
            tabIndex={-1}
            aria-label={`${label}: choose ${photosOnly ? "photos" : "a file"}`}
            multiple={photosOnly}
            accept={photosOnly || !VALUATION_POLICY.pdfUploadsEnabled ? "image/jpeg,image/png,image/webp" : "image/jpeg,image/png,image/webp,application/pdf"}
            onChange={(event) => void upload(event.target.files)}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Upload aria-hidden="true" />}
            disabled={!kind || progress !== null}
            loading={progress !== null}
            onClick={() => input.current?.click()}
          >
            {photosOnly ? "Add photos" : "Add a file"}
          </Button>
          {progress !== null ? (
            <span role="status" className="text-caption text-text-muted">
              Uploading {String(Math.round(progress))}%
            </span>
          ) : null}
        </div>
      ) : null}
      {kinds.some((k) => k !== "photo") ? (
        <p className="text-caption text-text-muted">
          {VALUATION_POLICY.pdfUploadsEnabled ? "" : "PDFs aren't accepted yet: upload a photo or screenshot of the document. "}
          {EVIDENCE_MESSAGES.redact}
        </p>
      ) : null}
      {error ? <p className="text-body-sm text-state-danger">{error}</p> : null}
      {message ? <FormAlert tone="danger">{message}</FormAlert> : null}
    </fieldset>
  );
}
