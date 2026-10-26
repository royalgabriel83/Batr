"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Flag } from "lucide-react";
import { ConfirmDialog } from "@/components/offers/ConfirmDialog";
import { FormAlert, toast } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { apiRequest } from "@/lib/offers/api-client";
import { ReportDialog, type ReportTarget } from "./ReportDialog";

export interface SafetyActionsProps {
  /** The other member's display name. */
  memberName: string;
  report: { target: ReportTarget; label: string; about?: string };
  /** Who to block: the owner of an offer, or the other member of a proposal. */
  block: { offer_id: string } | { proposal_id: string };
  /** After blocking from an offer page the offer is hidden, so go to Explore; elsewhere refresh. */
  afterBlock: "explore" | "refresh";
  className?: string;
}

const linkClasses =
  "inline-flex h-11 items-center gap-1.5 rounded-md px-1 text-body-sm font-medium text-text-secondary hover:text-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring";

/**
 * Report and Block (milestone-6.md, S1 and S3): quiet links under the
 * content they are about, so they're there when needed without
 * competing with the main action.
 */
export function SafetyActions({ memberName, report, block, afterBlock, className }: SafetyActionsProps) {
  const router = useRouter();
  const [reporting, setReporting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  async function confirmBlock() {
    const attempt = key ?? crypto.randomUUID();
    setKey(attempt);
    setBusy(true);
    setError(null);
    const result = await apiRequest<{ blocked: true }>("/api/v1/blocks", { method: "POST", json: block, idempotencyKey: attempt });
    setBusy(false);
    setConfirming(false);
    if (!result.ok) {
      setKey(null);
      setError(result.error.message);
      return;
    }
    setBlocked(true);
    toast({ text: `You blocked ${memberName}.`, action: { label: "Blocked members", href: "/account/blocked" } });
    if (afterBlock === "explore") router.push("/explore");
    else router.refresh();
  }

  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-x-4">
        <button type="button" className={linkClasses} onClick={() => setReporting(true)}>
          <Flag aria-hidden="true" className="size-4" />
          {report.label}
        </button>
        {blocked ? (
          <Link href="/account/blocked" className={linkClasses}>
            <Ban aria-hidden="true" className="size-4" />
            Blocked · Manage in your account
          </Link>
        ) : (
          <button type="button" className={linkClasses} onClick={() => setConfirming(true)}>
            <Ban aria-hidden="true" className="size-4" />
            Block {memberName}
          </button>
        )}
      </div>
      {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      <ReportDialog open={reporting} target={report.target} about={report.about} onClose={() => setReporting(false)} />
      <ConfirmDialog
        open={confirming}
        title={`Block ${memberName}?`}
        confirmLabel="Block"
        confirmVariant="danger"
        busy={busy}
        onConfirm={() => void confirmBlock()}
        onCancel={() => setConfirming(false)}
      >
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Neither of you can send the other proposals or messages.</li>
          <li>You won&apos;t see each other&apos;s offers.</li>
          <li>Open proposals between you will be closed.</li>
          <li>Agreements you&apos;ve already made stay as they are.</li>
        </ul>
        <p className="mt-3">{memberName} won&apos;t be told. You can unblock them from your account.</p>
      </ConfirmDialog>
    </div>
  );
}
