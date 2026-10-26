import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Handshake } from "lucide-react";
import { CHANGE_CHIPS, PRODUCT_NAME } from "@batr/shared";
import { Conversation } from "@/components/messages/Conversation";
import { SafetyActions } from "@/components/safety/SafetyActions";
import { NegotiationActions } from "@/components/proposals/NegotiationActions";
import { ProposalStatusBadge } from "@/components/proposals/ProposalStatusBadge";
import { TermsPair } from "@/components/proposals/TermsPair";
import { FormAlert, MemberInitial } from "@/components/ui";
import {
  cashLabel,
  changedWord,
  chipsFor,
  formatDay,
  formatRecordTime,
  formatWhen,
  nameOr,
  otherRole,
  shortRef,
  sidesFor,
  type RevisionView,
} from "@/lib/proposals/terms";
import { requireMember } from "@/server/auth";
import {
  loadAgreement,
  loadProposal,
  loadThread,
} from "@/server/proposals/queries";

export const metadata: Metadata = { title: `Exchange · ${PRODUCT_NAME}` };

// The negotiation view (specs/milestone-3.md, unit 16; user journey 6
// and 7): whose turn it is, the latest terms with cash between the
// sides, only the actions the viewer may take, and every earlier
// revision with its change chips. Accepted, it shows "Agreed" and
// leads to the agreement (specs/milestone-4.md, user journey 1).

export default async function ExchangePage({
  params,
}: PageProps<"/exchanges/[id]">) {
  const { id } = await params;
  await requireMember(`/exchanges/${id}`);
  const proposal = await loadProposal(id);
  if (!proposal) notFound();
  const me = proposal.viewer_role;
  const other = nameOr(proposal[otherRole(me)].display_name);
  const revisions = proposal.revisions;
  const latest = revisions.at(-1) as RevisionView;
  const [agreement, thread] = await Promise.all([
    proposal.agreement_id ? loadAgreement(proposal.agreement_id) : null,
    loadThread(proposal.id),
  ]);
  const changed =
    proposal.status === "open" && proposal.changed_offer_ids.length > 0;
  const byWho = (revision: RevisionView) =>
    revision.author === me ? "you" : other;
  const pair = (revision: RevisionView, compact = false) => {
    const { give, get } = sidesFor(me, revision);
    return (
      <TermsPair
        give={give}
        get={get}
        cash={cashLabel(revision.cash, me, other)}
        compact={compact}
      />
    );
  };

  const headline =
    proposal.status === "open"
      ? proposal.turn === me
        ? "Your turn"
        : `Waiting for ${other}`
      : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <Link
        href="/exchanges"
        className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Exchanges
      </Link>

      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <MemberInitial name={other} size="lg" />
          <div className="flex min-w-0 flex-col">
            <h1 className="text-h2 break-words">Exchange with {other}</h1>
            <p className="text-body-sm text-text-secondary">
              {proposal.offer ? (
                proposal.offer.status === "active" ? (
                  <>
                    On{" "}
                    <Link
                      href={`/offers/${proposal.offer.id}`}
                      className="font-semibold text-accent-primary underline-offset-2 hover:underline"
                    >
                      {proposal.offer.title}
                    </Link>
                  </>
                ) : (
                  <>On {proposal.offer.title}</>
                )
              ) : null}
            </p>
            <p className="text-caption text-text-muted">{shortRef(proposal.id)}</p>
          </div>
        </div>
        {headline ? (
          <div className="flex flex-col gap-0.5">
            <p className="text-h3">{headline}</p>
            <p className="text-body-sm text-text-secondary">
              Open until {formatDay(proposal.expires_at)} unless there are new
              terms.
            </p>
          </div>
        ) : proposal.status === "accepted" ? null : (
          <p>
            <ProposalStatusBadge status={proposal.status} />
          </p>
        )}
      </header>

      {proposal.close_reason === "offer_closed" ? (
        <FormAlert tone="info">
          This offer was closed, so the proposal was declined automatically.
        </FormAlert>
      ) : proposal.close_reason === "blocked" ? (
        // Worded so neither member learns who blocked whom (milestone-6.md, S1).
        <FormAlert tone="info">This proposal was closed.</FormAlert>
      ) : proposal.status === "expired" ? (
        <FormAlert tone="info">
          This proposal expired after 14 days with no new terms. Either of you
          can start a new one.
        </FormAlert>
      ) : proposal.status === "withdrawn" ? (
        <FormAlert tone="info">
          {latest.author === me
            ? "You withdrew these terms."
            : `${other} withdrew these terms.`}
        </FormAlert>
      ) : proposal.status === "declined" ? (
        <FormAlert tone="info">
          {latest.author === me
            ? `${other} declined these terms.`
            : "You declined these terms."}
        </FormAlert>
      ) : null}
      {changed ? (
        <FormAlert tone="info">
          This {changedWord([...latest.gives, ...latest.gets], proposal.changed_offer_ids)} changed after these terms were sent, so they can&apos;t be
          accepted as they are.
          {proposal.actions.counter
            ? " Counter to send the same exchange with the latest details."
            : ` ${other} can counter with the latest details.`}
        </FormAlert>
      ) : null}

      {agreement ? (
        <section
          aria-labelledby="agreed-heading"
          className="flex flex-col gap-4 rounded-xl bg-accent-soft p-4 md:p-5"
        >
          <h2 id="agreed-heading" className="flex items-center gap-2 text-h3">
            <Handshake
              aria-hidden="true"
              className="size-5 text-accent-primary"
            />
            Agreed
          </h2>
          <p className="text-body-sm text-text-secondary">
            You and {other} agreed these terms on{" "}
            {formatRecordTime(agreement.created_at)}. Handover, any change to the
            terms and cancelling all happen in the agreement.
          </p>
          <Link
            href={`/agreements/${agreement.id}`}
            className="inline-flex h-10 items-center justify-center gap-2 self-start rounded-full bg-accent-primary px-4 text-body-sm font-semibold text-text-on-accent hover:bg-accent-primary-hover"
          >
            Open the agreement
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
          {agreement.listing_changed ? (
            <FormAlert tone="info">
              The listing has changed since you agreed. Your agreement still
              uses the terms you accepted.
            </FormAlert>
          ) : null}
          {me === "owner" && agreement.offer?.status === "active" ? (
            <FormAlert tone="info">
              Your offer is still listed, so others can still propose on it.{" "}
              <Link
                href="/my-offers"
                className="font-semibold text-accent-primary underline"
              >
                Pause or close it in My offers
              </Link>
            </FormAlert>
          ) : null}
        </section>
      ) : null}

      <section
        aria-labelledby="latest-heading"
        className="flex flex-col gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 md:p-5"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="latest-heading" className="text-h3">
            {proposal.status === "accepted" ? "Agreed terms" : "Latest terms"}
          </h2>
          <p className="text-caption text-text-muted">
            Sent by {byWho(latest)} · {formatWhen(latest.created_at)}
          </p>
        </div>
        {revisions.length > 1 ? (
          <a
            href="#history"
            className="self-start text-body-sm font-semibold text-accent-primary underline-offset-4 hover:underline"
          >
            History: {earlierLabel(revisions.length - 1)}
          </a>
        ) : null}
        <Chips previous={revisions.at(-2)} revision={latest} />
        {pair(latest)}
        {latest.note ? (
          <blockquote className="rounded-lg bg-bg-subtle p-3 text-body-sm whitespace-pre-line break-words">
            <span className="block text-caption font-semibold text-text-muted">
              Note from {byWho(latest)}
            </span>
            {latest.note}
          </blockquote>
        ) : null}
        <NegotiationActions
          proposalId={proposal.id}
          revision={proposal.revision}
          latestRevisionId={proposal.latest_revision_id}
          actions={proposal.actions}
          otherName={other}
          termsChanged={changed}
          terms={pair(latest, true)}
        />
      </section>

      {thread ? (
        <Conversation proposalId={proposal.id} otherName={other} initial={thread} />
      ) : null}

      <SafetyActions
        memberName={other}
        report={{ target: { subject_type: "member", proposal_id: proposal.id }, label: `Report ${other}` }}
        block={{ proposal_id: proposal.id }}
        afterBlock="refresh"
        className="border-t border-border-default pt-2"
      />

      {revisions.length > 1 ? (
        <section
          id="history"
          aria-labelledby="history-heading"
          className="flex scroll-mt-20 flex-col gap-3"
        >
          <h2 id="history-heading" className="text-h3">
            History
          </h2>
          <p className="-mt-2 text-body-sm text-text-secondary">
            Every earlier set of terms, newest first.
          </p>
          <ol className="flex flex-col gap-3">
            {revisions
              .slice(0, -1)
              .reverse()
              .map((revision) => (
                <li
                  key={revision.id}
                  className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-surface p-4"
                >
                  <p className="flex flex-wrap items-baseline justify-between gap-2 text-body-sm">
                    <span className="font-semibold">
                      Terms {revision.number}
                    </span>
                    <span className="text-caption text-text-muted">
                      Sent by {byWho(revision)} ·{" "}
                      {formatWhen(revision.created_at)}
                    </span>
                  </p>
                  <Chips
                    previous={revisions[revision.number - 2]}
                    revision={revision}
                  />
                  {pair(revision, true)}
                  {revision.note ? (
                    <p className="text-body-sm whitespace-pre-line break-words text-text-secondary">
                      “{revision.note}”
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

/** "2 earlier sets of terms", for the link to the history (UI review, 2026-10-23). */
const earlierLabel = (count: number) => `${String(count)} earlier ${count === 1 ? "set of terms" : "sets of terms"}`;

function Chips({
  previous,
  revision,
}: {
  previous: RevisionView | undefined;
  revision: RevisionView;
}) {
  const chips = chipsFor(previous, revision);
  if (chips.length === 0) return null;
  return (
    <ul
      aria-label="Changes from the terms before"
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
