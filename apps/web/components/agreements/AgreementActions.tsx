"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import {
  AGREEMENT_LIMITS,
  CANCEL_REASON_MESSAGES,
  type AgreementPermissions,
} from "@batr/shared";
import { ConfirmDialog } from "@/components/offers/ConfirmDialog";
import { Button, FormAlert, Textarea, toast } from "@/components/ui";
import { apiRequest } from "@/lib/offers/api-client";

type Action =
  | "handover"
  | "accept_change"
  | "reject_change"
  | "withdraw_change"
  | "request_cancel"
  | "accept_cancel"
  | "reject_cancel"
  | "withdraw_cancel";
type ErrorBody = {
  code: string;
  message: string;
  reason?: string;
  fields?: Record<string, string>;
};

export interface AgreementActionsProps {
  agreementId: string;
  revision: number;
  bindingVersionId: string;
  pendingVersionId: string | null;
  requestId: string | null;
  actions: AgreementPermissions;
  otherName: string;
  /** The binding terms, restated in the handover dialog. */
  terms: ReactNode;
  /** What to confirm: a service once it has been done (milestone 9, V6). */
  handoverInstruction: string;
  /** The pending change, restated when accepting it. */
  pendingTerms?: ReactNode;
  /** Accepting the change would fail: an item it adds changed since. */
  pendingChanged: boolean;
}

const CHECK_EVERY_MS = 30_000;
const DONE: Record<Action, string> = {
  handover: "Handover confirmed",
  accept_change: "Change accepted",
  reject_change: "Change rejected",
  withdraw_change: "Change withdrawn",
  request_cancel: "Request sent",
  accept_cancel: "Agreement cancelled",
  reject_cancel: "Agreement kept",
  withdraw_cancel: "Request withdrawn",
};

/**
 * The actions the viewer may take on an agreement (specs/milestone-4.md,
 * user journey 3 to 5). Handover, accepting a change and cancelling
 * confirm in a dialog. While the page is open it checks for changes;
 * when there are some, actions are disabled until the member refreshes.
 */
export function AgreementActions({
  agreementId,
  revision,
  bindingVersionId,
  pendingVersionId,
  requestId,
  actions,
  otherName,
  terms,
  handoverInstruction,
  pendingTerms,
  pendingChanged,
}: AgreementActionsProps) {
  const router = useRouter();
  const id = useId();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorBody | null>(null);
  const [stale, setStale] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const keys = useRef<Partial<Record<Action, string>>>({});

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      const result = await apiRequest<{ revision: number }>(
        `/api/v1/agreements/${agreementId}`,
      );
      if (!cancelled && result.ok && result.data.revision !== revision)
        setStale(true);
    }
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [agreementId, revision]);

  const refresh = () => {
    setStale(false);
    setError(null);
    router.refresh();
  };

  function request(action: Action): { path: string; json?: unknown } {
    const base = `/api/v1/agreements/${agreementId}`;
    switch (action) {
      case "handover":
        return { path: `${base}/handover`, json: { version_id: bindingVersionId } };
      case "accept_change":
      case "reject_change":
      case "withdraw_change":
        return {
          path: `${base}/changes/${pendingVersionId ?? ""}/${action.replace("_change", "")}`,
        };
      case "request_cancel":
        return { path: `${base}/cancellation`, json: { reason } };
      default:
        return {
          path: `${base}/cancellation/${action.replace("_cancel", "")}`,
          json: { request_id: requestId },
        };
    }
  }

  async function run(action: Action) {
    if (action === "request_cancel") {
      const length = reason.trim().length;
      if (length < AGREEMENT_LIMITS.cancelReasonMin) {
        setReasonError(CANCEL_REASON_MESSAGES.tooShort);
        return;
      }
      if (length > AGREEMENT_LIMITS.cancelReasonMax) {
        setReasonError(CANCEL_REASON_MESSAGES.tooLong);
        return;
      }
    }
    setBusy(true);
    setError(null);
    keys.current[action] ??= crypto.randomUUID();
    const { path, json } = request(action);
    const result = await apiRequest(path, {
      method: "POST",
      json,
      idempotencyKey: keys.current[action],
    });
    setBusy(false);
    if (result.ok) {
      keys.current = {};
      setConfirming(null);
      setReason("");
      setReasonError(null);
      toast({ text: DONE[action] });
      router.refresh();
      return;
    }
    const body = result.error as ErrorBody;
    if (action === "request_cancel" && body.fields?.reason) {
      setReasonError(body.fields.reason);
      return;
    }
    setConfirming(null);
    if (body.code === "CONFLICT" && body.reason !== "handover_started")
      setStale(true);
    else setError(body);
  }

  const any = Object.values(actions).some(Boolean);
  if (!any && !stale) return null;
  const secondary =
    "inline-flex h-10 items-center justify-center rounded-full border border-border-strong bg-bg-surface px-4 text-body-sm font-semibold text-text-primary hover:bg-bg-subtle";

  return (
    <div className="flex flex-col gap-3">
      {stale ? (
        <FormAlert tone="info">
          <p>
            Something changed on this agreement. Refresh to see the latest
            before you act.
          </p>
          <Button
            variant="secondary"
            size="sm"
            icon={<RefreshCw aria-hidden="true" className="size-4" />}
            onClick={refresh}
            className="mt-2"
          >
            Refresh
          </Button>
        </FormAlert>
      ) : null}
      {error ? (
        <FormAlert tone="danger">
          {error.message}
          {error.code === "NETWORK" || error.code === "INTERNAL"
            ? " Try again."
            : null}
        </FormAlert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {actions.handover ? (
          <Button onClick={() => setConfirming("handover")} disabled={stale}>
            I&apos;ve handed over my side
          </Button>
        ) : null}
        {actions.accept_change ? (
          <Button
            onClick={() => setConfirming("accept_change")}
            disabled={stale || pendingChanged}
          >
            Accept change
          </Button>
        ) : null}
        {actions.reject_change ? (
          <Button
            variant="secondary"
            onClick={() => setConfirming("reject_change")}
            disabled={stale}
          >
            Reject change
          </Button>
        ) : null}
        {actions.withdraw_change ? (
          <Button
            variant="secondary"
            onClick={() => setConfirming("withdraw_change")}
            disabled={stale}
          >
            Withdraw change
          </Button>
        ) : null}
        {actions.accept_cancel ? (
          <Button
            variant="secondary"
            onClick={() => setConfirming("accept_cancel")}
            disabled={stale}
          >
            Agree to cancel
          </Button>
        ) : null}
        {actions.reject_cancel ? (
          <Button
            variant="secondary"
            onClick={() => void run("reject_cancel")}
            loading={busy && !confirming}
            disabled={stale}
          >
            Keep the agreement
          </Button>
        ) : null}
        {actions.withdraw_cancel ? (
          <Button
            variant="secondary"
            onClick={() => setConfirming("withdraw_cancel")}
            disabled={stale}
          >
            Withdraw request
          </Button>
        ) : null}
        {actions.propose_change ? (
          stale ? (
            <Button variant="secondary" disabled>
              Propose a change
            </Button>
          ) : (
            <Link href={`/agreements/${agreementId}/change`} className={secondary}>
              Propose a change
            </Link>
          )
        ) : null}
        {actions.request_cancel ? (
          <Button
            variant="secondary"
            onClick={() => setConfirming("request_cancel")}
            disabled={stale}
          >
            Ask to cancel
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming === "handover"}
        title="Confirm your handover?"
        confirmLabel="Confirm handover"
        busy={busy}
        onConfirm={() => void run("handover")}
        onCancel={() => setConfirming(null)}
      >
        <div className="flex flex-col gap-3">
          {terms}
          <p>
            {handoverInstruction} This can&apos;t be undone, and the terms
            can&apos;t change after it.
          </p>
          <p>
            {otherName} is asked to confirm their side too. When you&apos;ve
            both confirmed, the agreement is completed and moves to Closed.
          </p>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "accept_change"}
        title="Accept these new terms?"
        confirmLabel="Accept change"
        busy={busy}
        onConfirm={() => void run("accept_change")}
        onCancel={() => setConfirming(null)}
      >
        <div className="flex flex-col gap-3">
          {pendingTerms}
          <p>These terms replace the current ones for you and {otherName}.</p>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "reject_change"}
        title="Reject this change?"
        confirmLabel="Reject change"
        busy={busy}
        onConfirm={() => void run("reject_change")}
        onCancel={() => setConfirming(null)}
      >
        The current terms stay as they are.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "withdraw_change"}
        title="Withdraw your change?"
        confirmLabel="Withdraw change"
        busy={busy}
        onConfirm={() => void run("withdraw_change")}
        onCancel={() => setConfirming(null)}
      >
        The current terms stay as they are.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "request_cancel"}
        title="Ask to cancel?"
        confirmLabel="Send request"
        busy={busy}
        onConfirm={() => void run("request_cancel")}
        onCancel={() => {
          setReasonError(null);
          setConfirming(null);
        }}
      >
        <div className="flex flex-col gap-3">
          <p>
            {otherName} sees your reason and can agree to cancel or keep the
            agreement. Until then, it stays as it is.
          </p>
          <Textarea
            id={`${id}-reason`}
            label="Reason"
            maxLength={AGREEMENT_LIMITS.cancelReasonMax}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            error={reasonError ?? undefined}
          />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "accept_cancel"}
        title="Cancel this agreement?"
        confirmLabel="Agree to cancel"
        confirmVariant="danger"
        busy={busy}
        onConfirm={() => void run("accept_cancel")}
        onCancel={() => setConfirming(null)}
      >
        This ends the agreement for you and {otherName}. It can&apos;t be
        undone.
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "withdraw_cancel"}
        title="Withdraw your request?"
        confirmLabel="Withdraw request"
        busy={busy}
        onConfirm={() => void run("withdraw_cancel")}
        onCancel={() => setConfirming(null)}
      >
        The agreement carries on as before.
      </ConfirmDialog>
    </div>
  );
}
