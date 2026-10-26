import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Archive, Handshake, Hourglass, Inbox } from "lucide-react";
import { PRODUCT_NAME, PROPOSAL_BOXES } from "@batr/shared";
import { AgreementRow } from "@/components/agreements/AgreementRow";
import { ProposalRow } from "@/components/proposals/ProposalRow";
import { EmptyState } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { requireMember } from "@/server/auth";
import {
  loadAgreements,
  loadProposals,
  loadUnreadCounts,
  loadWaitingCounts,
} from "@/server/proposals/queries";

export const metadata: Metadata = { title: `Exchanges · ${PRODUCT_NAME}` };

// The Exchanges list (specs/milestone-3.md, unit 16; specs/milestone-4.md,
// A6): Your turn, Waiting, Agreed (active agreements) and Closed
// (completed and cancelled agreements, then proposals that ended
// without one), newest activity first.

const TABS = {
  turn: PROPOSAL_BOXES.turn,
  waiting: PROPOSAL_BOXES.waiting,
  agreed: "Agreed",
  closed: PROPOSAL_BOXES.closed,
} as const;
type Tab = keyof typeof TABS;
const TAB_IDS = Object.keys(TABS) as Tab[];

const EMPTY: Record<Tab, { title: string; body: string; Icon: typeof Inbox }> =
  {
    turn: {
      title: "Nothing is waiting on you",
      body: "When someone proposes on your offer or replies to your terms, it appears here.",
      Icon: Inbox,
    },
    waiting: {
      title: "You're not waiting on anyone",
      body: "Proposals you send appear here until the other member replies.",
      Icon: Hourglass,
    },
    agreed: {
      title: "No agreements in progress",
      body: "When you and another member agree terms, the agreement appears here until it's completed or cancelled.",
      Icon: Handshake,
    },
    closed: {
      title: "Nothing closed yet",
      body: "Completed and cancelled agreements, and declined, withdrawn and expired proposals appear here.",
      Icon: Archive,
    },
  };

const linkClasses =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent-primary px-4 text-body-sm font-semibold text-text-on-accent hover:bg-accent-primary-hover";
const olderClasses =
  "inline-flex h-11 items-center gap-2 self-center rounded-full border border-border-strong px-5 text-body-sm font-semibold hover:bg-bg-subtle";

const param = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : null;

export default async function ExchangesPage({
  searchParams,
}: PageProps<"/exchanges">) {
  const query = await searchParams;
  const tabParam = param(query.box) ?? "turn";
  const tab: Tab = (TAB_IDS as string[]).includes(tabParam)
    ? (tabParam as Tab)
    : "turn";
  // Closed pages its two lists separately.
  const cursor = param(query.cursor);
  const agreementCursor = param(query.acursor);
  await requireMember(`/exchanges${tab === "turn" ? "" : `?box=${tab}`}`);
  const proposalBox = tab === "agreed" ? null : tab;
  const agreementBox =
    tab === "agreed" ? "active" : tab === "closed" ? "closed" : null;
  const [proposals, agreements, counts, unread] = await Promise.all([
    // Paging one Closed list leaves the other out.
    proposalBox && !(agreementCursor && !cursor)
      ? loadProposals(proposalBox, cursor)
      : null,
    agreementBox && !(cursor && !agreementCursor)
      ? loadAgreements(agreementBox, agreementCursor)
      : null,
    loadWaitingCounts(),
    loadUnreadCounts(),
  ]);
  const badge: Partial<Record<Tab, number>> = {
    turn: counts.turn,
    agreed: counts.agreements,
  };
  const empty = EMPTY[tab];
  const nothing =
    !cursor &&
    !agreementCursor &&
    (proposals?.proposals.length ?? 0) === 0 &&
    (agreements?.agreements.length ?? 0) === 0;
  const older = (name: "cursor" | "acursor", value: string) =>
    `/exchanges?box=${tab}&${name}=${encodeURIComponent(value)}`;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-8 pb-12 md:px-6 md:pt-12 md:pb-16">
      <h1 className="text-h1 md:text-h2-lg">Exchanges</h1>
      <nav aria-label="Exchanges">
        <ul className="flex gap-1 rounded-full bg-bg-subtle p-1">
          {TAB_IDS.map((id) => (
            <li key={id} className="min-w-0 flex-1">
              <Link
                href={id === "turn" ? "/exchanges" : `/exchanges?box=${id}`}
                aria-current={id === tab ? "page" : undefined}
                className={cx(
                  "flex h-10 items-center justify-center gap-1 rounded-full px-1.5 text-body-sm font-semibold whitespace-nowrap sm:gap-1.5 sm:px-2",
                  id === tab
                    ? "bg-bg-surface text-text-primary shadow-card"
                    : "text-text-secondary hover:text-text-primary",
                )}
              >
                {TABS[id]}
                {(badge[id] ?? 0) > 0 ? (
                  <span className="rounded-full bg-accent-primary px-1.5 text-caption text-text-on-accent tabular-nums">
                    {badge[id]}
                    <span className="sr-only"> waiting on you</span>
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {nothing ? (
        <EmptyState
          icon={<empty.Icon aria-hidden="true" />}
          title={empty.title}
          action={
            tab === "waiting" ? (
              <Link href="/explore" className={linkClasses}>
                Explore offers
              </Link>
            ) : undefined
          }
        >
          {empty.body}
        </EmptyState>
      ) : (
        <>
          {agreements && agreements.agreements.length > 0 ? (
            <section className="flex flex-col gap-3">
              {tab === "closed" ? (
                <h2 className="text-h3">Agreements</h2>
              ) : null}
              <ul
                aria-label={tab === "closed" ? "Closed agreements" : TABS[tab]}
                className="flex flex-col gap-3"
              >
                {agreements.agreements.map((agreement) => (
                  <AgreementRow
                    key={agreement.id}
                    agreement={agreement}
                    unread={unread[agreement.proposal_id]}
                  />
                ))}
              </ul>
              {agreements.next_cursor ? (
                <Link href={older("acursor", agreements.next_cursor)} className={olderClasses}>
                  {tab === "closed" ? "Show older agreements" : "Show older"}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </section>
          ) : null}
          {proposals && proposals.proposals.length > 0 ? (
            <section className="flex flex-col gap-3">
              {tab === "closed" ? (
                <h2 className="text-h3">Proposals</h2>
              ) : null}
              <ul aria-label={TABS[tab]} className="flex flex-col gap-3">
                {proposals.proposals.map((proposal) => (
                  <ProposalRow
                    key={proposal.id}
                    proposal={proposal}
                    unread={unread[proposal.id]}
                  />
                ))}
              </ul>
              {proposals.next_cursor ? (
                <Link href={older("cursor", proposals.next_cursor)} className={olderClasses}>
                  {tab === "closed" ? "Show older proposals" : "Show older"}
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </main>
  );
}
