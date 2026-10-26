"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageOff } from "lucide-react";
import { signInPathFor } from "@batr/shared";
import { Button, FormAlert } from "@/components/ui";
import { ConfirmDialog } from "@/components/offers/ConfirmDialog";
import { ExchangePair } from "@/components/offers/ExchangePair";
import { OfferStatusBadge } from "@/components/offers/OfferStatusBadge";
import { apiRequest, newIdempotencyKey } from "@/lib/offers/api-client";
import { errorMessage } from "@/lib/offers/editor-state";
import type { OfferSummary } from "@/lib/offers/types";

type Action = "pause" | "resume" | "close" | "delete";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/**
 * One offer in My offers (OfferCard.manage): thumbnail, title, status
 * and the actions its status allows (state-model.md §2). Closing and
 * deleting ask for confirmation. Open-proposal counts arrive with
 * proposals (Milestone 3).
 */
export function MyOfferRow({ offer }: { offer: OfferSummary }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [confirm, setConfirm] = useState<"close" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One key per attempt; kept after a network failure so a retry can't apply twice.
  const keys = useRef<Partial<Record<Action, string>>>({});
  const title = offer.title || "Untitled draft";

  async function run(action: Action) {
    setBusy(action);
    setError(null);
    keys.current[action] ??= newIdempotencyKey();
    const result = await apiRequest(action === "delete" ? `/api/v1/offers/${offer.id}` : `/api/v1/offers/${offer.id}/${action}`, {
      method: action === "delete" ? "DELETE" : "POST",
      json: { expected_revision: offer.revision, expected_status: offer.status },
      idempotencyKey: keys.current[action],
    });
    if (result.ok || result.error.code !== "NETWORK") Reflect.deleteProperty(keys.current, action);
    setBusy(null);
    setConfirm(null);
    if (!result.ok && result.status === 401) {
      window.location.assign(signInPathFor("/my-offers"));
      return;
    }
    if (!result.ok) setError(errorMessage(result.error));
    // On success, and on a conflict, show the latest state of every offer.
    if (result.ok || result.error.code === "CONFLICT") router.refresh();
  }

  return (
    <li className="flex gap-4 py-4 sm:items-center">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-bg-subtle">
        {offer.cover?.thumb_url ? (
          <Image src={offer.cover.thumb_url} alt={offer.cover.alt_text} fill unoptimized sizes="80px" className="object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-text-muted">
            <ImageOff aria-hidden="true" className="size-6" />
            <span className="sr-only">No photo</span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h3 className="line-clamp-2 text-body font-semibold tracking-tight break-words">{title}</h3>
          <ExchangePair offering={offer.offering_text} wants={offer.wants_text} className="max-w-sm" />
          <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
            <OfferStatusBadge status={offer.status} removed={Boolean(offer.removed_at)} />
            <span>
              {offer.photo_count} {offer.photo_count === 1 ? "photo" : "photos"} · Updated {dateFormat.format(new Date(offer.updated_at))}
            </span>
          </div>
          {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {offer.status !== "closed" ? (
            // Same 44px hit area as a small Button; 7px because the 1px border is outside the ::before box.
            <Link
              href={`/offers/${offer.id}/edit`}
              aria-label={`Edit ${title}`}
              className="relative inline-flex h-8 min-w-11 items-center justify-center rounded-full border border-border-strong bg-bg-surface px-3 text-body-sm font-semibold before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[''] hover:bg-bg-subtle"
            >
              Edit
            </Link>
          ) : null}
          <Link
            href={`/offers/${offer.id}/valuation`}
            aria-label={`Valuation for ${title}`}
            className="relative inline-flex h-8 min-w-11 items-center justify-center rounded-full border border-border-strong bg-bg-surface px-3 text-body-sm font-semibold before:absolute before:inset-x-0 before:-inset-y-[7px] before:content-[''] hover:bg-bg-subtle"
          >
            Valuation
          </Link>
          {offer.status === "active" ? (
            <Button size="sm" variant="secondary" loading={busy === "pause"} disabled={busy !== null} onClick={() => void run("pause")} aria-label={`Pause ${title}`}>
              Pause
            </Button>
          ) : null}
          {offer.status === "paused" ? (
            <Button size="sm" variant="secondary" loading={busy === "resume"} disabled={busy !== null} onClick={() => void run("resume")} aria-label={`Resume ${title}`}>
              Resume
            </Button>
          ) : null}
          {offer.status === "active" || offer.status === "paused" ? (
            <Button size="sm" variant="tertiary" disabled={busy !== null} onClick={() => setConfirm("close")} aria-label={`Close ${title}`}>
              Close
            </Button>
          ) : null}
          {offer.status === "draft" ? (
            <Button size="sm" variant="tertiary" disabled={busy !== null} onClick={() => setConfirm("delete")} aria-label={`Delete ${title}`}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "close"}
        title="Close this offer?"
        confirmLabel="Close offer"
        confirmVariant="danger"
        busy={busy === "close"}
        onConfirm={() => void run("close")}
        onCancel={() => setConfirm(null)}
      >
        <p>
          <span className="font-semibold text-text-primary">{title}</span> will no longer be shown to others. Closed offers can&apos;t be reopened.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this draft?"
        confirmLabel="Delete draft"
        confirmVariant="danger"
        busy={busy === "delete"}
        onConfirm={() => void run("delete")}
        onCancel={() => setConfirm(null)}
      >
        <p>
          <span className="font-semibold text-text-primary">{title}</span> and its photos will be deleted. This can&apos;t be undone.
        </p>
      </ConfirmDialog>
    </li>
  );
}
