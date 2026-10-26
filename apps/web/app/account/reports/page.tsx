import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CircleCheck, Clock, Flag } from "lucide-react";
import { PRODUCT_NAME, REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from "@batr/shared";
import { Badge, EmptyState } from "@/components/ui";
import { formatWhen } from "@/lib/proposals/terms";
import { SUBJECT_LABELS } from "@/lib/safety/labels";
import { requireMember } from "@/server/auth";
import { loadMyReports } from "@/server/safety/queries";

// Account → My reports (milestone-6.md, S7): Received, then Reviewed.
// The outcome and the moderator's note are never shown.

export const metadata: Metadata = { title: `My reports · ${PRODUCT_NAME}` };

export default async function MyReportsPage() {
  await requireMember("/account/reports");
  const reports = await loadMyReports();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6 pb-12 md:px-6 md:pt-10 md:pb-16">
      <Link href="/account" className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Your account
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 md:text-h2-lg">My reports</h1>
        <p className="text-body-sm text-text-secondary">
          BATR reviews every report. To keep everyone safe, we don&apos;t share what happened next, and the member is never told who reported them.
        </p>
      </div>
      {reports.length === 0 ? (
        <EmptyState icon={<Flag aria-hidden="true" />} title="No reports">
          You can report an offer, a member or a message that breaks the rules.
        </EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-border-default rounded-xl border border-border-default bg-bg-surface shadow-card">
          {reports.map((report) => (
            <li key={report.id} className="flex flex-wrap items-center gap-3 px-5 py-4 md:px-6">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-caption font-semibold text-text-muted">{SUBJECT_LABELS[report.subject_type]}</span>
                <span className="text-body font-semibold break-words">{report.label}</span>
                <span className="text-caption text-text-secondary">
                  {REPORT_REASON_LABELS[report.reason]} · Sent {formatWhen(report.created_at)}
                </span>
              </span>
              <Badge tone={report.status === "reviewed" ? "success" : "info"} icon={report.status === "reviewed" ? <CircleCheck /> : <Clock />}>
                {REPORT_STATUS_LABELS[report.status]}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
