import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { UnreadCount } from "@/components/messages/UnreadCount";
import { MemberInitial } from "@/components/ui/MemberInitial";
import type { ProposalSummaryView } from "@/server/api/proposals";
import {
  cashLabel,
  exchangeTitle,
  formatWhen,
  itemsSentence,
  nameOr,
  otherRole,
  sidesFor,
} from "@/lib/proposals/terms";
import { ProposalStatusBadge } from "./ProposalStatusBadge";

/**
 * One row of the Exchanges list (specs/milestone-3.md, user journey 5):
 * what it's about, the other member, both sides of the latest terms and when they were
 * sent. The whole row opens the negotiation.
 */
export function ProposalRow({
  proposal,
  unread = 0,
}: {
  proposal: ProposalSummaryView;
  /** Unread messages in its conversation (Milestone 5). */
  unread?: number;
}) {
  const title = exchangeTitle(proposal.latest, proposal.offer_id);
  const other = nameOr(proposal[otherRole(proposal.viewer_role)].display_name);
  const { give, get } = sidesFor(proposal.viewer_role, proposal.latest);
  const cash = cashLabel(proposal.latest.cash, proposal.viewer_role, other);
  const turn =
    proposal.status === "open"
      ? proposal.turn === proposal.viewer_role
        ? "Your turn"
        : `Waiting for ${other}`
      : null;
  return (
    <li>
      <Link
        href={`/exchanges/${proposal.id}`}
        className="group flex items-center gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 transition hover:ring-accent-primary/40"
      >
        <MemberInitial name={other} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words font-semibold">{title}</span>
            <span className="text-body-sm text-text-secondary">with {other}</span>
            {turn ? (
              <span className="text-caption text-text-secondary">{turn}</span>
            ) : (
              <ProposalStatusBadge status={proposal.status} />
            )}
            <UnreadCount count={unread} />
          </span>
          <span className="text-body-sm break-words text-text-secondary">
            <span className="text-text-primary">You give</span>{" "}
            {itemsSentence(give)}
            <span aria-hidden="true"> · </span>
            <span className="text-text-primary">You get</span>{" "}
            {itemsSentence(get)}
            {cash ? (
              <>
                <span aria-hidden="true"> · </span>
                {cash}
              </>
            ) : null}
          </span>
          <time
            dateTime={proposal.latest.created_at}
            className="text-caption text-text-muted"
          >
            Latest terms {formatWhen(proposal.latest.created_at)}
          </time>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-text-muted transition group-hover:translate-x-0.5"
        />
      </Link>
    </li>
  );
}
