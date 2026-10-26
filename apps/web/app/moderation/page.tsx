import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Gauge, Inbox, SearchX } from "lucide-react";
import {
  CASE_RISKS,
  CASE_STATUS_LABELS,
  CASE_SUBJECTS,
  PRODUCT_NAME,
  MODERATION_REASON_LABELS,
  caseLabel,
} from "@batr/shared";
import { Badge, Button, EmptyState, Select, TextField } from "@/components/ui";
import { formatWhen } from "@/lib/proposals/terms";
import { RISK_LABELS, STATUS_ICONS, STATUS_TONES, SUBJECT_LABELS } from "@/lib/safety/labels";
import { queueFilters } from "@/server/api/safety";
import { requireMember } from "@/server/auth";
import { loadModerationQueue } from "@/server/safety/queries";

// The moderation queue (milestone-8-moderation-and-disputes.md, W1–W4):
// high risk first, then oldest, with filters and search. Moderators
// only; everyone else gets 404. A moderator never sees a case they made
// or one about them (milestone-6.md, S4).

export const metadata: Metadata = { title: `Moderation · ${PRODUCT_NAME}`, robots: { index: false } };

const STATUS_OPTIONS = [
  { value: "active", label: "Open and in review" },
  { value: "open", label: CASE_STATUS_LABELS.open },
  { value: "in_review", label: CASE_STATUS_LABELS.in_review },
  { value: "closed", label: CASE_STATUS_LABELS.closed },
];
const ASSIGNED_OPTIONS = [
  { value: "me", label: "Assigned to me" },
  { value: "unassigned", label: "Unassigned" },
];

export default async function ModerationQueuePage({ searchParams }: PageProps<"/moderation">) {
  await requireMember("/moderation");
  const filters = queueFilters(await searchParams);
  const reports = await loadModerationQueue(filters);
  if (reports === null) notFound();
  const filtered = Boolean(filters.type || filters.risk || filters.assigned || filters.q || (filters.status && filters.status !== "active"));
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-body-sm font-semibold text-accent-primary">BATR staff</p>
          <h1 className="text-h1 md:text-h2-lg">Cases</h1>
        </div>
        <Link
          href="/moderation/suspensions"
          className="inline-flex h-11 items-center gap-1 text-body-sm font-semibold text-accent-primary underline-offset-2 hover:underline"
        >
          Suspended members
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      </div>

      <form
        method="get"
        role="search"
        aria-label="Filter cases"
        className="grid gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end"
      >
        <TextField id="q" name="q" type="search" label="Search" defaultValue={filters.q ?? ""} placeholder="Case number, offer or member" maxLength={100} />
        <Select
          id="type"
          name="type"
          label="Type"
          placeholder="All types"
          defaultValue={filters.type ?? ""}
          options={CASE_SUBJECTS.map((subject) => ({ value: subject, label: SUBJECT_LABELS[subject] }))}
        />
        <Select
          id="risk"
          name="risk"
          label="Risk"
          placeholder="Any risk"
          defaultValue={filters.risk ?? ""}
          options={CASE_RISKS.map((risk) => ({ value: risk, label: RISK_LABELS[risk].label }))}
        />
        <Select id="status" name="status" label="Status" defaultValue={filters.status ?? "active"} options={STATUS_OPTIONS} />
        <Select id="assigned" name="assigned" label="Assignee" placeholder="Anyone" defaultValue={filters.assigned ?? ""} options={ASSIGNED_OPTIONS} />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
          <Button type="submit">Show cases</Button>
          {filtered ? (
            <Link href="/moderation" className="inline-flex h-11 items-center px-2 text-body-sm font-semibold text-accent-primary underline-offset-2 hover:underline">
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      <p className="sr-only" role="status">
        {reports.length === 1 ? "1 case" : `${String(reports.length)} cases`}
      </p>
      {reports.length === 0 ? (
        filtered ? (
          <EmptyState icon={<SearchX aria-hidden="true" />} title="No cases match">
            Try another filter, or clear them to see every open case.
          </EmptyState>
        ) : (
          <EmptyState icon={<Inbox aria-hidden="true" />} title="No open cases">
            New reports and exchange problems appear here, high risk first.
          </EmptyState>
        )
      ) : (
        <ol className="flex flex-col divide-y divide-border-default rounded-xl bg-bg-surface shadow-card ring-1 ring-border-default/70">
          {reports.map((report) => {
            const StatusIcon = STATUS_ICONS[report.status];
            return (
            <li key={report.id}>
              <Link href={`/moderation/${report.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-bg-subtle sm:flex-row sm:items-center sm:gap-4">
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-caption font-semibold text-text-muted">
                    {caseLabel(report.case_number)} · {SUBJECT_LABELS[report.subject_type]} · {MODERATION_REASON_LABELS[report.reason]}
                  </span>
                  <span className="truncate text-body font-semibold">{report.label}</span>
                  <span className="text-caption text-text-secondary">
                    About {report.member_name} · reported by {report.reporter_name}
                    {report.assignee_name ? ` · ${report.assigned_to_me ? "Assigned to you" : `Assigned to ${report.assignee_name}`}` : " · Unassigned"}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={RISK_LABELS[report.risk].tone} icon={<Gauge />}>
                      {RISK_LABELS[report.risk].label}
                    </Badge>
                    <Badge tone={STATUS_TONES[report.status]} icon={<StatusIcon />}>
                      {CASE_STATUS_LABELS[report.status]}
                    </Badge>
                  </span>
                  <span className="text-caption text-text-muted">{formatWhen(report.created_at)}</span>
                </span>
              </Link>
            </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
