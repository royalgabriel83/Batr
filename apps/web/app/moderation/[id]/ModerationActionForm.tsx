"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { SAFETY_LIMITS, SAFETY_MESSAGES, WARNING_MESSAGE, type CaseSubject, type ModerationAction } from "@batr/shared";
import { ConfirmDialog } from "@/components/offers/ConfirmDialog";
import { Button, FormAlert, Textarea, toast } from "@/components/ui";
import { apiRequest } from "@/lib/offers/api-client";
import type { CaseAction } from "@/server/api/safety";

type Target = "reported" | "reporter";

const PAUSE_LIFTED = " The pause on this exchange is lifted.";

const LABELS: Record<ModerationAction, { label: string; detail: (name: string, exchange: boolean) => string }> = {
  dismiss: { label: "Dismiss the report", detail: () => "Nothing breaks the rules. Nothing changes for anyone." },
  remove_offer: { label: "Remove the offer", detail: () => "Closes it as “Removed by BATR” and declines its open proposals." },
  suspend: {
    label: "Suspend a member",
    detail: (name, exchange) =>
      `${name} can still sign in and see their agreements, but can't publish, propose or message. Their offers are hidden.${exchange ? PAUSE_LIFTED : ""}`,
  },
  warn: {
    label: "Warn a member",
    detail: (name, exchange) => `${name} sees this once: “${WARNING_MESSAGE}” No limits are applied.${exchange ? PAUSE_LIFTED : ""}`,
  },
  resume: { label: "Resume the agreement", detail: () => "The pause is lifted. Nothing else changes." },
  cancel_agreement: {
    label: "Cancel the agreement",
    detail: () => "Both members are told BATR cancelled it after reviewing a problem. BATR doesn't move or return money or items.",
  },
  record_breach: {
    label: "Record that a member didn't keep to the agreement",
    detail: (name) => `Moderators see it as a count on ${name}'s history. Members never see it.${PAUSE_LIFTED}`,
  },
};

/** W6 and D3: the actions each kind of case offers, in this order. */
const BY_SUBJECT: Record<CaseSubject, ModerationAction[]> = {
  offer: ["dismiss", "remove_offer", "suspend"],
  member: ["dismiss", "warn", "suspend"],
  message: ["dismiss", "warn", "suspend"],
  agreement: ["resume", "cancel_agreement", "record_breach", "warn", "suspend"],
};

/** On an exchange problem these can be taken against either member. */
const TARGETED: ModerationAction[] = ["warn", "suspend", "record_breach"];

/** The dialog that asks once more, for every decision except Dismiss and Warn. */
function confirmation(action: ModerationAction, name: string): { title: string; confirm: string } {
  switch (action) {
    case "remove_offer":
      return { title: "Remove this offer?", confirm: "Remove offer" };
    case "suspend":
      return { title: `Suspend ${name}?`, confirm: "Suspend member" };
    case "resume":
      return { title: "Resume this agreement?", confirm: "Resume agreement" };
    case "cancel_agreement":
      return { title: "Cancel this agreement?", confirm: "Cancel agreement" };
    case "record_breach":
      return { title: `Record this against ${name}?`, confirm: "Record it" };
    default:
      return { title: `${LABELS[action].label}?`, confirm: LABELS[action].label };
  }
}

/** What the submit button says, so the consequence is named before it's taken. */
function submitLabel(action: ModerationAction, name: string): string {
  switch (action) {
    case "suspend":
      return `Suspend ${name}`;
    case "warn":
      return `Warn ${name}`;
    case "record_breach":
      return `Record it against ${name}`;
    default:
      return LABELS[action].label;
  }
}

export interface ModerationActionFormProps {
  reportId: string;
  subjectType: CaseSubject;
  actions: Record<CaseAction, boolean>;
  memberName: string;
  reporterName: string;
}

/**
 * S5, W6 and D3: one decision with a required note closes the case;
 * every decision is logged and can't be changed. Everything except
 * Dismiss and Warn asks once more in a dialog that restates the
 * consequence.
 */
export function ModerationActionForm({ reportId, subjectType, actions, memberName, reporterName }: ModerationActionFormProps) {
  const id = useId();
  const router = useRouter();
  const exchange = subjectType === "agreement";
  const allowed = BY_SUBJECT[subjectType].filter((action) => actions[action] || (exchange && TARGETED.includes(action)));
  const [action, setAction] = useState<ModerationAction | null>(null);
  const [target, setTarget] = useState<Target>("reported");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const targeted = exchange && action !== null && TARGETED.includes(action);
  const name = targeted && target === "reporter" ? reporterName : memberName;

  function submit(event: FormEvent) {
    event.preventDefault();
    const found: Record<string, string> = {};
    if (!action) found.action = "Choose an action.";
    const length = note.trim().length;
    if (length < SAFETY_LIMITS.noteMin || length > SAFETY_LIMITS.noteMax) found.note = SAFETY_MESSAGES.note;
    setErrors(found);
    setAlert(null);
    if (Object.keys(found).length > 0) return;
    if (action === "dismiss" || action === "warn") void send();
    else setConfirming(true);
  }

  async function send() {
    const attempt = key ?? crypto.randomUUID();
    setKey(attempt);
    setBusy(true);
    const result = await apiRequest(`/api/v1/moderation/reports/${reportId}/actions`, {
      method: "POST",
      json: { action, note: note.trim(), ...(targeted ? { target } : {}) },
      idempotencyKey: attempt,
    });
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      setKey(null);
      if (result.error.fields) setErrors(result.error.fields);
      setAlert(result.error.message);
      return;
    }
    toast({ text: "Done. The case is closed.", action: { label: "Back to cases", href: "/moderation" } });
    router.refresh();
  }

  function choose(option: ModerationAction) {
    setAction(option);
    setKey(null);
  }

  return (
    <form onSubmit={submit} noValidate aria-labelledby={`${id}-heading`} className="flex flex-col gap-4 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 md:p-5">
      <h2 id={`${id}-heading`} className="text-h3">
        Decide
      </h2>
      {alert ? <FormAlert tone="danger">{alert}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2" aria-describedby={errors.action ? `${id}-action-error` : undefined}>
        <legend className="mb-1.5 text-body-sm font-semibold">Action</legend>
        {allowed.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border-default px-3 py-2.5 has-checked:border-accent-primary has-checked:bg-accent-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus-ring"
          >
            <input
              type="radio"
              name="action"
              value={option}
              checked={action === option}
              onChange={() => choose(option)}
              className="mt-1 size-4 accent-accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-body-sm font-semibold">{LABELS[option].label}</span>
              <span className="text-caption text-text-secondary">
                {LABELS[option].detail(action === option ? name : memberName, exchange)}
              </span>
            </span>
          </label>
        ))}
        {errors.action ? (
          <p id={`${id}-action-error`} className="text-body-sm text-state-danger">
            {errors.action}
          </p>
        ) : null}
      </fieldset>
      {targeted ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-body-sm font-semibold">Which member?</legend>
          {(
            [
              ["reported", `${memberName}, the other member`],
              ["reporter", `${reporterName}, who reported the problem`],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 text-body-sm">
              <input
                type="radio"
                name="target"
                value={value}
                checked={target === value}
                onChange={() => {
                  setTarget(value);
                  setKey(null);
                }}
                className="size-4 accent-accent-primary"
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <Textarea
        id={`${id}-note`}
        label="Note for the record"
        required
        rows={3}
        maxLength={SAFETY_LIMITS.noteMax}
        value={note}
        onChange={(event) => {
          setNote(event.target.value);
          setKey(null);
        }}
        error={errors.note}
        helper="Other moderators see this. The members never do."
      />
      <div className="flex justify-end">
        <Button type="submit" loading={busy && !confirming}>
          {action ? `${submitLabel(action, name)}${action === "dismiss" || action === "warn" ? "" : "…"}` : "Confirm action"}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={action ? confirmation(action, name).title : ""}
        confirmLabel={action ? confirmation(action, name).confirm : "Confirm"}
        cancelLabel={action === "cancel_agreement" ? "Go back" : undefined}
        confirmVariant={action === "resume" ? "primary" : "danger"}
        busy={busy}
        onConfirm={() => void send()}
        onCancel={() => setConfirming(false)}
      >
        <p>
          {action ? LABELS[action].detail(name, exchange) : null} Your note is saved with this decision in the log, and it can&apos;t be changed
          afterwards.
        </p>
      </ConfirmDialog>
    </form>
  );
}
