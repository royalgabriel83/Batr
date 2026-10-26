import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { CHANGE_CHIPS, PRODUCT_NAME, formatKobo } from "@batr/shared";
import { AgreementActions } from "@/components/agreements/AgreementActions";
import { AgreementProgress } from "@/components/agreements/AgreementProgress";
import { AgreementStatusBadge } from "@/components/agreements/AgreementStatusBadge";
import { ProblemStatus, ReportProblemButton } from "@/components/agreements/ExchangeProblem";
import { Conversation } from "@/components/messages/Conversation";
import { SafetyActions } from "@/components/safety/SafetyActions";
import { TermsPair } from "@/components/proposals/TermsPair";
import { FormAlert, MemberInitial } from "@/components/ui";
import {
  cashLabel,
  changedWord,
  handoverInstruction,
  chipsFor,
  formatRecordTime,
  nameOr,
  otherRole,
  shortRef,
  sidesFor,
} from "@/lib/proposals/terms";
import type { VersionView } from "@/server/api/agreements";
import { requireMember } from "@/server/auth";
import { loadAgreement, loadThread } from "@/server/proposals/queries";

export const metadata: Metadata = { title: `Agreement · ${PRODUCT_NAME}` };

// The agreement view (specs/milestone-4.md, unit 19; user journey 2 to
// 6): where it stands, the binding terms (locked), any pending change
// or cancellation request, the fee shares as information (A1), the
// actions the viewer may take and every earlier version.

export default async function AgreementPage({
  params,
}: PageProps<"/agreements/[id]">) {
  const { id } = await params;
  await requireMember(`/agreements/${id}`);
  const agreement = await loadAgreement(id);
  if (!agreement) notFound();
  const me = agreement.viewer_role;
  const other = nameOr(agreement[otherRole(me)].display_name);
  const thread = await loadThread(agreement.proposal_id);
  const versions = agreement.versions;
  const binding = versions.find(
    (v) => v.id === agreement.binding_version_id,
  ) as VersionView;
  const pending = versions.find((v) => v.outcome === "pending") ?? null;
  const earlier = versions
    .filter((v) => v.outcome !== "binding" && v.outcome !== "pending")
    .reverse();
  const byWho = (role: string) => (role === me ? "you" : other);
  const pair = (version: VersionView, compact = false) => {
    const { give, get } = sidesFor(me, version);
    return (
      <TermsPair
        give={give}
        get={get}
        cash={cashLabel(version.cash, me, other)}
        compact={compact}
      />
    );
  };
  const request =
    agreement.status === "cancellation_requested" ||
    agreement.status === "cancelled"
      ? agreement.cancellation
      : null;
  const mineConfirmed = agreement.confirmed_by.includes(me);
  const theirsConfirmed = agreement.confirmed_by.includes(otherRole(me));

  let headline: string;
  let detail: string | null = null;
  switch (agreement.status) {
    case "active":
      if (mineConfirmed) {
        headline = `Waiting for ${other} to confirm`;
        detail = "You've handed over your side.";
      } else if (theirsConfirmed) {
        headline = `${other} has handed over`;
        detail = "Confirm your side once you've handed it over.";
      } else {
        headline = "Agreed";
        detail = `Arrange the handover with ${other}, then confirm your side here.`;
      }
      break;
    case "amendment_pending":
      headline =
        pending?.proposed_by === me
          ? `Waiting for ${other} to answer your change`
          : `${other} proposed a change`;
      detail = "The agreed terms stay in place until the change is accepted.";
      break;
    case "cancellation_requested":
      headline =
        request?.requested_by === me
          ? `Waiting for ${other} to answer your request to cancel`
          : `${other} asked to cancel`;
      detail = "The agreement stays as it is until the request is answered.";
      break;
    case "completed":
      headline = "Completed";
      detail = `You and ${other} both confirmed your handovers.`;
      break;
    default:
      headline = "Cancelled";
      detail = `You and ${other} agreed to cancel.`;
  }

  const fee = agreement.fee;
  // The actions sit with what they answer: a request to cancel, a
  // proposed change, or else the agreed terms.
  const where =
    agreement.status === "cancellation_requested"
      ? "request"
      : pending
        ? "change"
        : "terms";
  const actions = (
    <AgreementActions
      agreementId={agreement.id}
      revision={agreement.revision}
      bindingVersionId={agreement.binding_version_id}
      pendingVersionId={pending?.id ?? null}
      requestId={
        agreement.status === "cancellation_requested"
          ? (agreement.cancellation?.id ?? null)
          : null
      }
      actions={agreement.actions}
      otherName={other}
      terms={pair(binding, true)}
      handoverInstruction={handoverInstruction([...binding.gives, ...binding.gets])}
      pendingTerms={pending ? pair(pending, true) : undefined}
      pendingChanged={agreement.pending_changed_offer_ids.length > 0}
    />
  );

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <Link
        href={
          agreement.status === "completed" || agreement.status === "cancelled"
            ? "/exchanges?box=closed"
            : "/exchanges?box=agreed"
        }
        className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Exchanges
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <MemberInitial name={other} size="lg" />
          <div className="flex min-w-0 flex-col">
            <h1 className="text-h2 break-words">Agreement with {other}</h1>
            {agreement.offer ? (
              <p className="text-body-sm text-text-secondary">
                On {agreement.offer.title}
              </p>
            ) : null}
            <p className="text-caption text-text-muted">{shortRef(agreement.id)}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-h3">{headline}</span>
            {agreement.status === "active" ? null : (
              <AgreementStatusBadge status={agreement.status} />
            )}
          </p>
          {detail ? (
            <p className="text-body-sm text-text-secondary">{detail}</p>
          ) : null}
        </div>
      </header>

      <ProblemStatus agreementId={agreement.id} problem={agreement.problem} />

      <AgreementProgress
        viewerRole={me}
        otherName={other}
        status={agreement.status}
        createdAt={agreement.created_at}
        confirmations={agreement.confirmations}
        completedAt={agreement.completed_at}
        cancelledAt={agreement.cancelled_at}
      />

      {agreement.status === "completed" &&
      agreement.my_listed_offers.length > 0 ? (
        <FormAlert tone="info">
          {agreement.my_listed_offers.length === 1
            ? `Your offer ${agreement.my_listed_offers[0]?.title ?? ""} is still listed.`
            : `Your offers ${agreement.my_listed_offers.map((o) => o.title).join(" and ")} are still listed.`}{" "}
          {agreement.my_listed_offers.every((o) => o.offer_type === "service") ? (
            // Milestone 9, V8: a service can usually be offered again.
            <>
              Services usually stay listed.{" "}
              <Link href="/my-offers" className="font-semibold text-accent-primary underline">
                {agreement.my_listed_offers.length === 1 ? "Close it" : "Close them"} in My offers
              </Link>{" "}
              if you can&apos;t offer {agreement.my_listed_offers.length === 1 ? "it" : "them"} again.
            </>
          ) : (
            <>
              BATR doesn&apos;t close offers for you. If you can offer{" "}
              {agreement.my_listed_offers.length === 1 ? "it" : "them"} again,
              such as a service, leave {agreement.my_listed_offers.length === 1 ? "it" : "them"} listed. If not,{" "}
              <Link
                href="/my-offers"
                className="font-semibold text-accent-primary underline"
              >
                {agreement.my_listed_offers.length === 1 ? "close it" : "close them"}{" "}
                in My offers
              </Link>
            </>
          )}
        </FormAlert>
      ) : null}

      {agreement.listing_changed ? (
        <FormAlert tone="info">
          The listing has changed since you agreed. Your agreement still uses
          the terms you accepted.
        </FormAlert>
      ) : null}

      {request ? (
        <section
          aria-labelledby="cancel-heading"
          className="flex flex-col gap-2 rounded-xl bg-state-warning-soft p-4 md:p-5"
        >
          <h2 id="cancel-heading" className="text-h3">
            {request.requested_by === me
              ? "You asked to cancel"
              : `${other} asked to cancel`}
          </h2>
          <blockquote className="text-body-sm whitespace-pre-line break-words">
            “{request.reason}”
          </blockquote>
          <p className="text-caption text-text-muted">
            {formatRecordTime(request.created_at)}
          </p>
          {where === "request" ? actions : null}
        </section>
      ) : null}

      {pending ? (
        <section
          aria-labelledby="change-heading"
          className="flex flex-col gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 md:p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="change-heading" className="text-h3">
              Proposed change
            </h2>
            <p className="text-caption text-text-muted">
              Sent by {byWho(pending.proposed_by)} ·{" "}
              {formatRecordTime(pending.created_at)}
            </p>
          </div>
          <Chips previous={binding} version={pending} />
          {pair(pending)}
          {pending.note ? (
            <blockquote className="rounded-lg bg-bg-subtle p-3 text-body-sm whitespace-pre-line break-words">
              <span className="block text-caption font-semibold text-text-muted">
                Note from {byWho(pending.proposed_by)}
              </span>
              {pending.note}
            </blockquote>
          ) : null}
          {agreement.pending_changed_offer_ids.length > 0 ? (
            <FormAlert tone="info">
              {changedWord([...pending.gives, ...pending.gets], agreement.pending_changed_offer_ids) === "service" ? "A service" : "An item"} in this
              change was edited after it was sent, so it can&apos;t be accepted as it is.
              {agreement.actions.withdraw_change
                ? " Withdraw it and propose the change again."
                : ` ${other} can withdraw it and propose it again.`}
            </FormAlert>
          ) : null}
          {where === "change" ? actions : null}
        </section>
      ) : null}

      <section
        aria-labelledby="terms-heading"
        className="flex flex-col gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 md:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="terms-heading" className="flex items-center gap-2 text-h3">
            <Lock aria-hidden="true" className="size-4 text-text-muted" />
            Agreed terms
          </h2>
          <p className="text-caption text-text-muted">
            Version {binding.number}, in force since{" "}
            {formatRecordTime(binding.resolved_at ?? binding.created_at)}
          </p>
        </div>
        {pair(binding)}
        {binding.note ? (
          <blockquote className="rounded-lg bg-bg-subtle p-3 text-body-sm whitespace-pre-line break-words">
            <span className="block text-caption font-semibold text-text-muted">
              Note from {byWho(binding.proposed_by)}
            </span>
            {binding.note}
          </blockquote>
        ) : null}
        {where === "terms" ? actions : null}
      </section>

      {thread ? (
        <Conversation proposalId={agreement.proposal_id} otherName={other} initial={thread} />
      ) : null}

      <div className="flex flex-col border-t border-border-default pt-2">
        {agreement.problem.can_report ? <ReportProblemButton agreementId={agreement.id} /> : null}
        <SafetyActions
          memberName={other}
          report={{ target: { subject_type: "member", proposal_id: agreement.proposal_id }, label: `Report ${other}` }}
          block={{ proposal_id: agreement.proposal_id }}
          afterBlock="refresh"
        />
      </div>

      {fee ? (
        <section
          aria-labelledby="fee-heading"
          className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-surface p-4 md:p-5"
        >
          <h2 id="fee-heading" className="text-h3">
            BATR&apos;s fee, not collected yet
          </h2>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-body-sm">
            <dt className="text-text-secondary">Your share</dt>
            <dd className="text-right font-semibold tabular-nums">
              {formatKobo(me === "owner" ? fee.owner_share_kobo : fee.proposer_share_kobo)}
            </dd>
            <dt className="text-text-secondary">{other}&apos;s share</dt>
            <dd className="text-right tabular-nums">
              {formatKobo(me === "owner" ? fee.proposer_share_kobo : fee.owner_share_kobo)}
            </dd>
          </dl>
          <p className="text-caption text-text-muted">
            From BATR&apos;s valuation of {agreement.offer?.title ?? "this offer"}.
            Nothing is charged or collected for now.
          </p>
        </section>
      ) : null}

      {earlier.length > 0 ? (
        <section aria-labelledby="history-heading" className="flex flex-col gap-3">
          <h2 id="history-heading" className="text-h3">
            Earlier versions
          </h2>
          <ol className="flex flex-col gap-3">
            {earlier.map((version) => (
              <li
                key={version.id}
                className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-surface p-4"
              >
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm">
                  <span className="font-semibold">
                    Version {version.number} · {OUTCOME_LABELS[version.outcome]}
                  </span>
                  <span className="text-caption text-text-muted">
                    Sent by {byWho(version.proposed_by)} ·{" "}
                    {formatRecordTime(version.created_at)}
                  </span>
                </p>
                {pair(version, true)}
                {version.note ? (
                  <p className="text-body-sm whitespace-pre-line break-words text-text-secondary">
                    “{version.note}”
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}

const OUTCOME_LABELS: Record<string, string> = {
  superseded: "Replaced",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

function Chips({
  previous,
  version,
}: {
  previous: VersionView;
  version: VersionView;
}) {
  const chips = chipsFor(previous, version);
  if (chips.length === 0) return null;
  return (
    <ul
      aria-label="Changes from the agreed terms"
      className="flex flex-wrap gap-1.5"
    >
      {chips.map((chip) => (
        <li
          key={chip}
          className="rounded-full border border-border-default bg-bg-subtle px-2.5 py-0.5 text-caption text-text-secondary"
        >
          {CHANGE_CHIPS[chip]}
        </li>
      ))}
    </ul>
  );
}
