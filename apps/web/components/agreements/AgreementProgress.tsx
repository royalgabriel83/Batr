import { Check, CircleSlash } from "lucide-react";
import type { AgreementStatus } from "@batr/shared";
import { cx } from "@/components/ui/cx";
import { formatRecordTime, otherRole, type Role } from "@/lib/proposals/terms";

export interface AgreementProgressProps {
  viewerRole: Role;
  otherName: string;
  status: AgreementStatus;
  createdAt: string;
  confirmations: { party: Role; confirmed_at: string }[];
  completedAt: string | null;
  cancelledAt: string | null;
}

/**
 * Where the agreement is (specs/04-agreement-management.md, Design):
 * Agreed, each member's handover in the order they confirmed, then
 * Completed, or Cancelled when both agreed to cancel.
 */
export function AgreementProgress({
  viewerRole,
  otherName,
  status,
  createdAt,
  confirmations,
  completedAt,
  cancelledAt,
}: AgreementProgressProps) {
  const label = (party: Role) =>
    party === viewerRole ? "You handed over" : `${otherName} handed over`;
  const confirmed = confirmations.map((c) => c.party);
  // Steps still to come, the viewer's own first.
  const waiting = [viewerRole, otherRole(viewerRole)].filter(
    (party) => !confirmed.includes(party),
  );
  const steps: { label: string; when: string | null; done: boolean; stopped?: boolean }[] = [
    { label: "Agreed", when: createdAt, done: true },
    ...confirmations.map((c) => ({ label: label(c.party), when: c.confirmed_at, done: true })),
    ...waiting.map((party) => ({ label: label(party), when: null, done: false })),
    status === "cancelled"
      ? { label: "Cancelled", when: cancelledAt, done: true, stopped: true }
      : { label: "Completed", when: completedAt, done: status === "completed" },
  ];
  return (
    <ol aria-label="Progress" className="flex flex-col gap-3 sm:flex-row sm:gap-2">
      {steps.map((step, index) => (
        <li key={step.label} className="flex flex-1 items-start gap-2 sm:flex-col">
          <span
            aria-hidden="true"
            className={cx(
              "flex size-7 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
              step.stopped
                ? "bg-bg-subtle text-text-secondary"
                : step.done
                  ? "bg-accent-primary text-text-on-accent"
                  : "border border-border-strong text-text-muted",
            )}
          >
            {step.stopped ? (
              <CircleSlash className="size-4" />
            ) : step.done ? (
              <Check className="size-4" />
            ) : (
              index + 1
            )}
          </span>
          <span className="flex flex-col">
            <span className={cx("text-body-sm font-semibold", !step.done && "text-text-secondary")}>
              {step.label}
              <span className="sr-only">{step.done ? ", done" : ", not yet"}</span>
            </span>
            {step.when ? (
              <time dateTime={step.when} className="text-caption text-text-muted">
                {formatRecordTime(step.when)}
              </time>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
