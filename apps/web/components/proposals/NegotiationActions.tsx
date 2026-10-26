"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import type { ProposalPermissions } from "@batr/shared";
import { ConfirmDialog } from "@/components/offers/ConfirmDialog";
import { Button, FormAlert, toast } from "@/components/ui";
import { apiRequest } from "@/lib/offers/api-client";

type Action = "accept" | "decline" | "withdraw";
type ErrorBody = { code: string; message: string; reason?: string };

export interface NegotiationActionsProps {
  proposalId: string;
  revision: number;
  latestRevisionId: string;
  actions: ProposalPermissions;
  otherName: string;
  /** The latest terms, restated in the Accept and Decline dialogs. */
  terms: ReactNode;
  /** Accepting the latest terms would fail: an item changed since. */
  termsChanged: boolean;
}

const CHECK_EVERY_MS = 30_000;

/**
 * The actions the viewer may take on the latest terms (specs/
 * milestone-3.md, user journey 4 and 6). Accept and Decline confirm in
 * a dialog that restates the terms. While the page is open it checks
 * for new terms; when they arrive, actions are disabled until the
 * member refreshes ("New terms from {name}").
 */
export function NegotiationActions({
  proposalId,
  revision,
  latestRevisionId,
  actions,
  otherName,
  terms,
  termsChanged,
}: NegotiationActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorBody | null>(null);
  const [stale, setStale] = useState(false);
  const keys = useRef<Partial<Record<Action, string>>>({});

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      const result = await apiRequest<{ revision: number; status: string }>(
        `/api/v1/proposals/${proposalId}`,
      );
      if (
        !cancelled &&
        result.ok &&
        (result.data.revision !== revision ||
          result.data.status === "accepted" ||
          result.data.status === "declined" ||
          result.data.status === "withdrawn")
      ) {
        setStale(true);
      }
    }
    const timer = setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [proposalId, revision]);

  const refresh = () => {
    setStale(false);
    setError(null);
    router.refresh();
  };

  async function run(action: Action) {
    setBusy(true);
    setError(null);
    keys.current[action] ??= crypto.randomUUID();
    const result = await apiRequest(
      `/api/v1/proposals/${proposalId}/${action}`,
      {
        method: "POST",
        json:
          action === "accept"
            ? { revision_id: latestRevisionId }
            : { expected_revision: revision },
        idempotencyKey: keys.current[action],
      },
    );
    setBusy(false);
    setConfirming(null);
    if (result.ok) {
      keys.current = {};
      toast({
        text:
          action === "accept"
            ? "Agreed"
            : action === "decline"
              ? "Proposal declined"
              : "Proposal withdrawn",
      });
      router.refresh();
      return;
    }
    const body = result.error as ErrorBody;
    if (
      body.code === "CONFLICT" &&
      (body.reason === "stale_revision" || body.reason === "status_changed")
    )
      setStale(true);
    else setError(body);
  }

  const none =
    !actions.accept &&
    !actions.counter &&
    !actions.decline &&
    !actions.withdraw;
  if (none && !stale) return null;

  return (
    <div className="flex flex-col gap-3">
      {stale ? (
        <FormAlert tone="info">
          <p>
            New terms from {otherName}, or the proposal has changed. Refresh to
            see the latest before you act.
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
        {actions.accept ? (
          <Button
            onClick={() => setConfirming("accept")}
            disabled={stale || termsChanged}
          >
            Accept
          </Button>
        ) : null}
        {actions.counter ? (
          stale ? (
            <Button variant="secondary" disabled>
              Counter
            </Button>
          ) : (
            <Link
              href={`/exchanges/${proposalId}/counter`}
              className="inline-flex h-10 items-center justify-center rounded-full border border-border-strong bg-bg-surface px-4 text-body-sm font-semibold text-text-primary hover:bg-bg-subtle"
            >
              Counter
            </Link>
          )
        ) : null}
        {actions.decline ? (
          <Button
            variant="secondary"
            onClick={() => setConfirming("decline")}
            disabled={stale}
          >
            Decline
          </Button>
        ) : null}
        {actions.withdraw ? (
          <Button
            variant="secondary"
            onClick={() => setConfirming("withdraw")}
            disabled={stale}
          >
            Withdraw
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirming === "accept"}
        title="Accept these terms?"
        confirmLabel="Accept"
        busy={busy}
        onConfirm={() => void run("accept")}
        onCancel={() => setConfirming(null)}
      >
        <div className="flex flex-col gap-3">
          {terms}
          <p>
            This records your agreement with {otherName} on exactly these terms.
          </p>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "decline"}
        title="Decline these terms?"
        confirmLabel="Decline"
        busy={busy}
        onConfirm={() => void run("decline")}
        onCancel={() => setConfirming(null)}
      >
        <div className="flex flex-col gap-3">
          {terms}
          <p>
            This ends the proposal. Either of you can start a new one later.
          </p>
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirming === "withdraw"}
        title="Withdraw your terms?"
        confirmLabel="Withdraw"
        busy={busy}
        onConfirm={() => void run("withdraw")}
        onCancel={() => setConfirming(null)}
      >
        This ends the proposal. {otherName} will see it was withdrawn.
      </ConfirmDialog>
    </div>
  );
}
