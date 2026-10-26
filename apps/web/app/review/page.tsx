import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Inbox } from "lucide-react";
import { EXCHANGE_TYPES, PRODUCT_NAME, SUBMISSION_STATUSES, formatKobo, type SubmissionStatus } from "@batr/shared";
import { EmptyState } from "@/components/ui";
import { ValuationStatusBadge } from "@/components/valuation/ValuationStatusBadge";
import { firstParam } from "@/lib/forms/search-params";
import { requireMember } from "@/server/auth";
import { loadReviewQueue } from "@/server/valuation/queries";

// The valuation review queue (owner, 2026-10-17): BATR staff only.
// Oldest first, so nothing waits longest by accident.

export const metadata: Metadata = { title: `Valuation reviews · ${PRODUCT_NAME}`, robots: { index: false } };

const FILTERS: (SubmissionStatus | null)[] = [null, "submitted", "inspection_required", "appealed", "evidence_requested", "assessed", "not_approved"];
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export default async function ReviewQueuePage({ searchParams }: PageProps<"/review">) {
  await requireMember("/review");
  const requested = firstParam((await searchParams).status) ?? null;
  const status = requested && requested in SUBMISSION_STATUSES ? (requested as SubmissionStatus) : null;
  const rows = await loadReviewQueue(status);
  if (rows === null) notFound();
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10 lg:px-8">
      <div className="flex flex-col gap-1">
        <p className="text-body-sm font-semibold text-accent-primary">BATR staff</p>
        <h1 className="text-h1 md:text-h2-lg">Valuation reviews</h1>
      </div>
      <nav aria-label="Filter by status" className="-mx-4 overflow-x-auto px-4">
        <ul className="flex gap-2">
          {FILTERS.map((filter) => {
            const active = filter === status;
            return (
              <li key={filter ?? "all"}>
                <Link
                  href={filter ? `/review?status=${filter}` : "/review"}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex h-11 items-center rounded-full border px-4 text-body-sm font-medium whitespace-nowrap ${active ? "border-accent-primary bg-accent-soft text-accent-primary" : "border-border-default bg-bg-surface text-text-secondary hover:bg-bg-subtle"}`}
                >
                  {filter ? SUBMISSION_STATUSES[filter] : "Needs attention"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={<Inbox aria-hidden="true" />} title="Nothing here">
          No valuations match this filter.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border-default rounded-xl bg-bg-surface shadow-card ring-1 ring-border-default/70">
          {rows.map((row) => (
            <li key={row.id}>
              <Link href={`/review/valuations/${row.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-bg-subtle sm:flex-row sm:items-center sm:gap-4">
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-body font-semibold">{row.offer_title || "Untitled offer"}</span>
                  <span className="text-caption text-text-muted">
                    {row.submitter_name} · {EXCHANGE_TYPES[row.exchange_type]} · {row.components} {row.components === 1 ? "item" : "items"} · proposed{" "}
                    {formatKobo(row.proposed_total_kobo)}
                    {row.submitted_at ? ` · sent ${dateFormat.format(new Date(row.submitted_at))}` : ""}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {row.open_appeal ? <span className="text-caption text-state-info">{row.appeal_assigned_to_me ? "Appeal: yours" : "Appeal"}</span> : null}
                  {row.open_inspection ? <span className="text-caption text-state-warning">Inspection open</span> : null}
                  <ValuationStatusBadge status={row.status} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
