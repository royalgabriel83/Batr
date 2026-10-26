"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CirclePause, LifeBuoy } from "lucide-react";
import {
  PROBLEM_MONEY_NOTE,
  PROBLEM_REASONS,
  PROBLEM_REASON_LABELS,
  SAFETY_LIMITS,
  SAFETY_MESSAGES,
  type AgreementProblemView,
  type ProblemReason,
} from "@batr/shared";
import { Button, FormAlert, Textarea, toast } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { apiRequest } from "@/lib/offers/api-client";
import { formatRecordTime } from "@/lib/proposals/terms";

// Exchange problems (specs/milestone-8-moderation-and-disputes.md,
// D1–D3). The other member is never told who reported it, and every
// view says BATR doesn't move money.

const PAUSED_LINE = "Paused while BATR reviews a problem with this exchange.";

/** D2: where a reported problem stands, the pause, and the other member's one reply. */
export function ProblemStatus({ agreementId, problem }: { agreementId: string; problem: AgreementProblemView }) {
  const current = problem.current;
  if (!current) return null;
  const open = current.status === "open";
  return (
    <section
      aria-labelledby="problem-heading"
      className="flex flex-col gap-3 rounded-xl bg-state-info-soft p-4 ring-1 ring-state-info/30 md:p-5"
    >
      <h2 id="problem-heading" className="flex items-center gap-2 text-h3">
        {problem.paused ? <CirclePause aria-hidden="true" className="size-5 shrink-0" /> : <LifeBuoy aria-hidden="true" className="size-5 shrink-0" />}
        {open ? (problem.paused ? PAUSED_LINE : "BATR is reviewing a problem with this exchange") : "BATR has reviewed the problem"}
      </h2>
      <p className="text-body-sm">
        {open
          ? current.reported_by_you
            ? `You reported: ${current.reason ? PROBLEM_REASON_LABELS[current.reason] : "a problem"}. A person at BATR will review it.`
            : "A problem was reported with this exchange. A person at BATR will review it."
          : `Reported ${formatRecordTime(current.created_at)}, reviewed ${current.reviewed_at ? formatRecordTime(current.reviewed_at) : ""}.`}
        {open && problem.paused ? " Handover and changes to the terms wait until then." : ""}
      </p>
      <p className="text-body-sm font-semibold">{PROBLEM_MONEY_NOTE}</p>
      {open && current.can_reply ? <ReplyForm agreementId={agreementId} /> : null}
      {open && current.replied && !current.reported_by_you ? (
        <p className="text-body-sm text-text-secondary">You&apos;ve added your side. BATR will read it with the report.</p>
      ) : null}
    </section>
  );
}

function ReplyForm({ agreementId }: { agreementId: string }) {
  const id = useId();
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const text = reply.trim();
    if (text.length < 1 || text.length > SAFETY_LIMITS.problemReplyMax) {
      setError(`Write your side in up to ${String(SAFETY_LIMITS.problemReplyMax)} characters.`);
      return;
    }
    setError(null);
    setAlert(null);
    const attempt = key ?? crypto.randomUUID();
    setKey(attempt);
    setBusy(true);
    const result = await apiRequest(`/api/v1/agreements/${agreementId}/problem/reply`, {
      method: "POST",
      json: { reply: text },
      idempotencyKey: attempt,
    });
    setBusy(false);
    if (!result.ok) {
      setKey(null);
      setError(result.error.fields?.reply ?? null);
      setAlert(result.error.fields?.reply ? null : result.error.message);
      return;
    }
    toast({ text: "Your side was sent to BATR." });
    router.refresh();
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-state-info/30 pt-3">
      {alert ? <FormAlert tone="danger">{alert}</FormAlert> : null}
      <Textarea
        id={`${id}-reply`}
        label="Add your side (once)"
        rows={3}
        maxLength={SAFETY_LIMITS.problemReplyMax}
        value={reply}
        onChange={(event) => {
          setReply(event.target.value);
          setKey(null);
        }}
        error={error ?? undefined}
        helper="Only BATR reads this. You can send it once."
      />
      <div className="flex justify-end">
        <Button type="submit" variant="secondary" loading={busy}>
          Send your side
        </Button>
      </div>
    </form>
  );
}

const quietLink =
  "inline-flex h-11 items-center gap-1.5 rounded-md px-1 text-body-sm font-medium text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring";

/** D1: a quiet link under the agreement, opening the report form. */
export function ReportProblemButton({ agreementId, className }: { agreementId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <button type="button" className={quietLink} onClick={() => setOpen(true)}>
        <LifeBuoy aria-hidden="true" className="size-4" />
        Report a problem with this exchange
      </button>
      <ProblemDialog agreementId={agreementId} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function ProblemDialog({ agreementId, open, onClose }: { agreementId: string; open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const router = useRouter();
  const [reason, setReason] = useState<ProblemReason | null>(null);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
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
    setReason(null);
    setDetails("");
    setErrors({});
    setAlert(null);
    setKey(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!reason) found.reason = SAFETY_MESSAGES.reason;
    const length = details.trim().length;
    if (length < SAFETY_LIMITS.problemDetailsMin || length > SAFETY_LIMITS.detailsMax) {
      found.details = `Tell BATR what happened in at least ${String(SAFETY_LIMITS.problemDetailsMin)} characters.`;
    }
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) return;
    const attempt = key ?? crypto.randomUUID();
    setKey(attempt);
    setBusy(true);
    const result = await apiRequest(`/api/v1/agreements/${agreementId}/problem`, {
      method: "POST",
      json: { reason, details: details.trim() },
      idempotencyKey: attempt,
    });
    setBusy(false);
    if (!result.ok) {
      setKey(null);
      if (result.error.fields) setErrors(result.error.fields);
      setAlert({ tone: result.status === 409 || result.status === 429 ? "info" : "danger", text: result.error.message });
      return;
    }
    onClose();
    toast({ text: "Thanks. A person at BATR will review it." });
    router.refresh();
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
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-h3">
            Report a problem with this exchange
          </h2>
          <p className="text-body-sm text-text-secondary">
            A person at BATR will review it. Until then, handover and changes to the terms are paused for both of you. The other member
            won&apos;t be told who reported it.
          </p>
        </div>
        <FormAlert tone="info">{PROBLEM_MONEY_NOTE}</FormAlert>
        {alert ? <FormAlert tone={alert.tone}>{alert.text}</FormAlert> : null}
        <fieldset
          className="flex flex-col gap-2"
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? `${titleId}-reason-error` : undefined}
        >
          <legend className="mb-1.5 text-body-sm font-semibold">What went wrong?</legend>
          {PROBLEM_REASONS.map((option) => (
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
                onChange={() => {
                  setReason(option.id);
                  setKey(null);
                }}
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
          label="What happened?"
          required
          rows={4}
          maxLength={SAFETY_LIMITS.detailsMax}
          value={details}
          onChange={(event) => {
            setDetails(event.target.value);
            setKey(null);
          }}
          error={errors.details}
          helper={`At least ${String(SAFETY_LIMITS.problemDetailsMin)} characters. Only BATR reads this.`}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            Send to BATR
          </Button>
        </div>
      </form>
    </dialog>
  );
}
