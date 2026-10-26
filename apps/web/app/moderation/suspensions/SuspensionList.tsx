"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SAFETY_LIMITS, SAFETY_MESSAGES } from "@batr/shared";
import { Button, FormAlert, Textarea, toast } from "@/components/ui";
import { apiRequest } from "@/lib/offers/api-client";
import { formatWhen } from "@/lib/proposals/terms";
import type { SuspensionView } from "@/server/api/safety";

export function SuspensionList({ suspensions, senior }: { suspensions: SuspensionView[]; senior: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {suspensions.map((suspension) => (
        <SuspensionItem key={suspension.id} suspension={suspension} senior={senior} />
      ))}
    </ul>
  );
}

type Mode = "lift" | "appeal" | null;

const APPEAL_OUTCOMES = [
  { value: "upheld", label: "Keep the suspension" },
  { value: "lifted", label: "Lift the suspension" },
] as const;

/**
 * One suspension (S5, W8, W9). "Lift suspension" opens a note; a
 * senior moderator can also record an appeal's outcome, once.
 */
function SuspensionItem({ suspension, senior }: { suspension: SuspensionView; senior: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [outcome, setOutcome] = useState<"upheld" | "lifted" | null>(null);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  const canLift = suspension.mine || senior;
  const canAppeal = senior && suspension.appeal_outcome === null;

  function open(next: Mode) {
    setMode(next);
    setKey(null);
    setAlert(null);
    setError(null);
    setOutcomeError(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const length = note.trim().length;
    const noteError = length < SAFETY_LIMITS.noteMin || length > SAFETY_LIMITS.noteMax ? SAFETY_MESSAGES.note : null;
    const missingOutcome = mode === "appeal" && !outcome ? "Choose an outcome." : null;
    setError(noteError);
    setOutcomeError(missingOutcome);
    if (noteError || missingOutcome) return;
    setAlert(null);
    const attempt = key ?? crypto.randomUUID();
    setKey(attempt);
    setBusy(true);
    const result = await apiRequest(`/api/v1/moderation/suspensions/${suspension.id}/${mode === "appeal" ? "appeal" : "lift"}`, {
      method: "POST",
      json: mode === "appeal" ? { outcome, note: note.trim() } : { note: note.trim() },
      idempotencyKey: attempt,
    });
    setBusy(false);
    if (!result.ok) {
      setKey(null);
      setError(result.error.fields?.note ?? null);
      setAlert(result.error.fields?.note ? null : result.error.message);
      return;
    }
    toast({
      text:
        mode === "appeal" && outcome === "upheld"
          ? `Appeal recorded. ${suspension.member_name} stays suspended.`
          : `Suspension lifted for ${suspension.member_name}.`,
    });
    setMode(null);
    router.refresh();
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body font-semibold">{suspension.member_name}</span>
          <span className="text-caption text-text-muted">
            Suspended {formatWhen(suspension.created_at)}
            {suspension.mine ? " by you" : ""}
            {suspension.appeal_outcome === "upheld" ? " · Appeal decided: suspension kept" : ""}
          </span>
        </div>
        {mode ? null : (
          <div className="flex flex-wrap gap-2">
            {canAppeal ? (
              <Button variant="secondary" size="sm" onClick={() => open("appeal")}>
                Record appeal<span className="sr-only"> for {suspension.member_name}</span>
              </Button>
            ) : null}
            {canLift ? (
              <Button variant="secondary" size="sm" onClick={() => open("lift")}>
                Lift suspension<span className="sr-only"> for {suspension.member_name}</span>
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {suspension.note ? <p className="text-body-sm whitespace-pre-line break-words text-text-secondary">{suspension.note}</p> : null}
      {mode ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-3 border-t border-border-default pt-3">
          {alert ? <FormAlert tone="danger">{alert}</FormAlert> : null}
          {mode === "appeal" ? (
            <fieldset className="flex flex-col gap-1" aria-describedby={outcomeError ? `appeal-${suspension.id}-error` : undefined}>
              <legend className="mb-1 text-body-sm font-semibold">Outcome of the review</legend>
              {APPEAL_OUTCOMES.map((option) => (
                <label key={option.value} className="flex min-h-11 cursor-pointer items-center gap-3 text-body-sm">
                  <input
                    type="radio"
                    name={`outcome-${suspension.id}`}
                    value={option.value}
                    checked={outcome === option.value}
                    onChange={() => {
                      setOutcome(option.value);
                      setKey(null);
                    }}
                    className="size-4 accent-accent-primary"
                  />
                  {option.label}
                </label>
              ))}
              {outcomeError ? (
                <p id={`appeal-${suspension.id}-error`} className="text-body-sm text-state-danger">
                  {outcomeError}
                </p>
              ) : null}
            </fieldset>
          ) : null}
          <Textarea
            id={`${mode}-${suspension.id}`}
            label={mode === "appeal" ? "Note for the record" : "Why lift it?"}
            required
            rows={2}
            maxLength={SAFETY_LIMITS.noteMax}
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setKey(null);
            }}
            error={error ?? undefined}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setMode(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              {mode === "appeal" ? "Record outcome" : "Lift suspension"}
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
