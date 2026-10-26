"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { REPORT_REASONS, SAFETY_LIMITS, SAFETY_MESSAGES, type ReportReason, type ReportSubject } from "@batr/shared";
import { Button, FormAlert, Textarea } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { apiRequest } from "@/lib/offers/api-client";

/** What a report points to (milestone-6.md, S3). A member is named through an offer or a proposal. */
export type ReportTarget =
  | { subject_type: "offer"; offer_id: string }
  | { subject_type: "member"; offer_id: string }
  | { subject_type: "member"; proposal_id: string }
  | { subject_type: "message"; message_id: number };

const HEADINGS: Record<ReportSubject, string> = {
  offer: "Report this offer",
  member: "Report this member",
  message: "Report this message",
};

export const REPORT_THANKS = "Thanks. BATR will review this.";

export interface ReportDialogProps {
  open: boolean;
  target: ReportTarget;
  /** Shown under the heading, such as the offer title or member name. */
  about?: string;
  onClose: () => void;
}

/**
 * The report form (S3) in a native modal dialog, as ConfirmDialog:
 * focus is trapped, Escape closes and focus returns to the opener.
 * After sending, the reporter sees only "Thanks. BATR will review
 * this." (S7); the outcome is never shown.
 */
export function ReportDialog({ open, target, about, onClose }: ReportDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<{ tone: "danger" | "info"; text: string } | null>(null);
  const [key, setKey] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close() {
    if (busy) return;
    onClose();
    // Start fresh next time.
    setReason(null);
    setDetails("");
    setDone(false);
    setErrors({});
    setAlert(null);
    setKey(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!reason) found.reason = SAFETY_MESSAGES.reason;
    if (reason === "other" && details.trim().length < SAFETY_LIMITS.otherDetailsMin) found.details = SAFETY_MESSAGES.detailsNeeded;
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) return;
    // The same attempt reuses its key, so a retry can't file twice.
    const attempt = key ?? crypto.randomUUID();
    setKey(attempt);
    setBusy(true);
    const result = await apiRequest<{ id: string; status: string }>("/api/v1/reports", {
      method: "POST",
      json: { ...target, reason, details: details.trim() },
      idempotencyKey: attempt,
    });
    setBusy(false);
    if (result.ok) {
      setDone(true);
      return;
    }
    setKey(null);
    if (result.error.fields) setErrors(result.error.fields);
    setAlert({ tone: result.status === 409 ? "info" : "danger", text: result.error.message });
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] overflow-y-auto rounded-xl bg-bg-surface p-6 text-text-primary shadow-lg backdrop:bg-bg-inverse/60"
    >
      {done ? (
        <div className="flex flex-col gap-4">
          <h2 id={titleId} className="text-h3">
            {HEADINGS[target.subject_type]}
          </h2>
          <FormAlert tone="success">{REPORT_THANKS}</FormAlert>
          <p className="text-body-sm text-text-secondary">
            You can follow it under{" "}
            <Link href="/account/reports" className="font-semibold text-accent-primary underline-offset-2 hover:underline">
              My reports
            </Link>
            .
          </p>
          <div className="flex justify-end">
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-h3">
              {HEADINGS[target.subject_type]}
            </h2>
            {about ? <p className="text-body-sm text-text-secondary">{about}</p> : null}
          </div>
          {alert ? <FormAlert tone={alert.tone}>{alert.text}</FormAlert> : null}
          <fieldset
            className="flex flex-col gap-2"
            aria-invalid={errors.reason ? true : undefined}
            aria-describedby={errors.reason ? `${titleId}-reason-error` : undefined}
          >
            <legend className="mb-1.5 text-body-sm font-semibold">What&apos;s wrong?</legend>
            {REPORT_REASONS.map((option) => (
              <label
                key={option.id}
                className={cx(
                  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-body-sm has-checked:border-accent-primary has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring",
                  errors.reason ? "border-state-danger" : "border-border-default",
                )}
              >
                <input
                  type="radio"
                  name="reason"
                  value={option.id}
                  checked={reason === option.id}
                  onChange={() => setReason(option.id)}
                  className="size-4 accent-accent-primary"
                />
                {option.label}
              </label>
            ))}
            {errors.reason ? (
              <p id={`${titleId}-reason-error`} className="text-body-sm text-state-danger">
                {errors.reason}
              </p>
            ) : null}
          </fieldset>
          <Textarea
            id={`${titleId}-details`}
            label={reason === "other" ? "Tell us what's wrong" : "Details (optional)"}
            rows={4}
            maxLength={SAFETY_LIMITS.detailsMax}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            error={errors.details}
            helper="The member won't see who reported them."
          />
          <p className="text-caption text-text-muted">
            See{" "}
            <Link href="/rules" target="_blank" className="font-semibold text-accent-primary underline-offset-2 hover:underline">
              what can&apos;t be offered
            </Link>
            .
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Send report
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
