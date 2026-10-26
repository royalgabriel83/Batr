import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, ShieldAlert } from "lucide-react";
import {
  CASE_STATUS_LABELS,
  PRODUCT_NAME,
  MODERATION_REASON_LABELS,
  caseLabel,
  systemLineText,
  type OfferStatus,
  type SystemEvent,
} from "@batr/shared";
import { OfferStatusBadge } from "@/components/offers/OfferStatusBadge";
import { Badge } from "@/components/ui";
import { formatWhen } from "@/lib/proposals/terms";
import { ACTION_LABELS, RISK_LABELS, STATUS_ICONS, STATUS_TONES, SUBJECT_LABELS } from "@/lib/safety/labels";
import { requireMember } from "@/server/auth";
import { loadModerationReport } from "@/server/safety/queries";
import { CaseAgreement } from "./CaseAgreement";
import { ModerationActionForm } from "./ModerationActionForm";
import { TakeCaseButton } from "./TakeCaseButton";

// One case (milestone-6.md, S5 and S6; milestone-8-moderation-and-
// disputes.md, W5 and W6): only what it points to, this case's own log,
// the member's history as counts only, and the actions still open.
// Moderators only; everyone else gets 404.

export const metadata: Metadata = { title: `Case · ${PRODUCT_NAME}`, robots: { index: false } };

const card = "flex flex-col gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 md:p-5";

export default async function ModerationReportPage({ params }: PageProps<"/moderation/[id]">) {
  const { id } = await params;
  await requireMember(`/moderation/${id}`);
  const report = await loadModerationReport(id);
  if (!report) notFound();
  const { offer, offers, messages, other_name: otherName, agreement } = report.subject;
  const open = report.status !== "closed";
  const StatusIcon = STATUS_ICONS[report.status];
  const counts = report.member_counts;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <Link href="/moderation" className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Cases
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-body-sm font-semibold text-accent-primary">
          {caseLabel(report.case_number)} · {SUBJECT_LABELS[report.subject_type]} · {MODERATION_REASON_LABELS[report.reason]}
        </p>
        <h1 className="text-h2 break-words">{report.label}</h1>
        <p className="text-body-sm text-text-secondary">
          About {report.member_name} · reported by {report.reporter_name} on {formatWhen(report.created_at)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONES[report.status]} icon={<StatusIcon />}>
            {CASE_STATUS_LABELS[report.status]}
          </Badge>
          <Badge tone={RISK_LABELS[report.risk].tone} icon={<Gauge />}>
            {RISK_LABELS[report.risk].label}
          </Badge>
          {report.member_suspended ? (
            <Badge tone="warning" icon={<ShieldAlert />}>
              Member suspended
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-body-sm text-text-secondary">
            {report.assignee_name ? (report.assigned_to_me ? "Assigned to you" : `Assigned to ${report.assignee_name}`) : "No one has taken this case yet"}
          </p>
          {report.actions.take ? <TakeCaseButton reportId={report.id} takeOver={Boolean(report.assignee_name)} /> : null}
        </div>
        {report.details ? (
          <blockquote className="rounded-lg bg-bg-subtle p-3 text-body-sm whitespace-pre-line break-words">
            <span className="block text-caption font-semibold text-text-muted">
              {report.automatic ? "What BATR's check recorded" : "What the reporter said"}
            </span>
            {report.details}
          </blockquote>
        ) : null}
      </header>

      {offer ? (
        <section aria-labelledby="subject-heading" className={card}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="subject-heading" className="text-h3">
              The offer
            </h2>
            <OfferStatusBadge status={offer.status as OfferStatus} removed={Boolean(offer.removed_at)} />
          </div>
          {offer.photos.length > 0 ? (
            <ul className="flex gap-2 overflow-x-auto">
              {offer.photos.map((photo) => (
                <li key={photo.id} className="relative size-24 shrink-0 overflow-hidden rounded-lg bg-bg-subtle">
                  {photo.thumb_url ? (
                    <Image src={photo.thumb_url} alt={photo.alt_text} fill unoptimized sizes="96px" className="object-cover" />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-body font-semibold break-words">{offer.title}</p>
          <p className="text-body-sm whitespace-pre-line break-words text-text-secondary">{offer.description}</p>
          <dl className="grid gap-x-4 gap-y-1 text-body-sm sm:grid-cols-[9rem_minmax(0,1fr)]">
            <dt className="text-text-secondary">Offering</dt>
            <dd className="break-words">{offer.offering_text}</dd>
            <dt className="text-text-secondary">Wants</dt>
            <dd className="break-words">{offer.wants_text}</dd>
          </dl>
        </section>
      ) : null}

      {offers ? (
        <section aria-labelledby="subject-heading" className={card}>
          <h2 id="subject-heading" className="text-h3">
            {report.member_name}&apos;s offers
          </h2>
          {offers.length === 0 ? (
            <p className="text-body-sm text-text-secondary">No published offers.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-default">
              {offers.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 text-body-sm font-semibold break-words">{item.title}</span>
                  <OfferStatusBadge status={item.status as OfferStatus} removed={Boolean(item.removed_at)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {messages ? (
        <section aria-labelledby="subject-heading" className={card}>
          <div className="flex flex-col gap-1">
            <h2 id="subject-heading" className="text-h3">
              The message, in context
            </h2>
            <p className="text-caption text-text-muted">
              Between {report.member_name} and {otherName}. Up to 10 messages either side; nothing else of this conversation is shown.
            </p>
          </div>
          <ol className="flex flex-col gap-2">
            {messages.map((message) =>
              message.kind === "system" ? (
                <li key={message.id} className="text-center text-caption text-text-muted">
                  {/* Who acted isn't part of what a moderator sees (S6). */}
                  BATR: {systemLineText(message.event as SystemEvent, "them", "A member")}
                </li>
              ) : (
                <li
                  key={message.id}
                  className={
                    message.reported
                      ? "flex flex-col gap-0.5 rounded-lg bg-state-warning-soft p-3 ring-1 ring-state-warning/40"
                      : "flex flex-col gap-0.5 rounded-lg bg-bg-subtle p-3"
                  }
                >
                  <span className="text-caption font-semibold text-text-muted">
                    {message.from === "reported" ? report.member_name : otherName} · {formatWhen(message.created_at)}
                    {message.reported ? " · Reported" : ""}
                  </span>
                  <span className="text-body-sm whitespace-pre-wrap break-words">{message.body}</span>
                </li>
              ),
            )}
          </ol>
        </section>
      ) : null}

      {agreement ? <CaseAgreement agreement={agreement} memberName={report.member_name} reporterName={report.reporter_name} /> : null}

      <section aria-labelledby="counts-heading" className={card}>
        <div className="flex flex-col gap-1">
          <h2 id="counts-heading" className="text-h3">
            {report.member_name}&apos;s history
          </h2>
          <p className="text-caption text-text-muted">Counts only. Other cases&apos; content isn&apos;t shown here.</p>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Count label="Reports in 30 days" value={counts.reports_30_days} />
          <Count label="Earlier actions" value={counts.earlier_actions} />
          <Count label="Agreements not kept" value={counts.breaches} />
          <div className="flex flex-col gap-0.5 rounded-lg bg-bg-subtle p-3">
            <dt className="text-caption text-text-secondary">Suspended now</dt>
            <dd className="text-h3">{report.member_suspended ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </section>

      {open ? (
        <ModerationActionForm
          reportId={report.id}
          subjectType={report.subject_type}
          actions={report.actions}
          memberName={report.member_name}
          reporterName={report.reporter_name}
        />
      ) : null}

      <section aria-labelledby="history-heading" className="flex flex-col gap-3">
        <h2 id="history-heading" className="text-h3">
          This case&apos;s log
        </h2>
        {report.history.length === 0 ? (
          <p className="text-body-sm text-text-secondary">Nothing yet.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {report.history.map((entry, index) => (
              <li key={`${entry.created_at}-${String(index)}`} className="flex flex-col gap-1 rounded-lg border border-border-default bg-bg-surface p-3">
                <span className="text-body-sm font-semibold">{ACTION_LABELS[entry.action]}</span>
                <span className="text-body-sm whitespace-pre-line break-words text-text-secondary">{entry.note}</span>
                <span className="text-caption text-text-muted">
                  {entry.moderator_name} · {formatWhen(entry.created_at)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg bg-bg-subtle p-3">
      <dt className="text-caption text-text-secondary">{label}</dt>
      <dd className="text-h3">{value}</dd>
    </div>
  );
}
