import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { UnreadCount } from "@/components/messages/UnreadCount";
import { MemberInitial } from "@/components/ui/MemberInitial";
import type { AgreementSummaryView } from "@/server/api/agreements";
import {
  cashLabel,
  exchangeTitle,
  formatWhen,
  itemsSentence,
  nameOr,
  otherRole,
  sidesFor,
} from "@/lib/proposals/terms";
import { AgreementStatusBadge } from "./AgreementStatusBadge";

/**
 * One agreement in Exchanges (specs/milestone-4.md, A6): what it's
 * about, the other member, the binding terms, its status and whether it waits on the
 * viewer. The whole row opens the agreement.
 */
export function AgreementRow({
  agreement,
  unread = 0,
}: {
  agreement: AgreementSummaryView;
  /** Unread messages in its conversation (Milestone 5). */
  unread?: number;
}) {
  const me = agreement.viewer_role;
  const title = exchangeTitle(agreement.terms, agreement.offer?.id);
  const other = nameOr(agreement[otherRole(me)].display_name);
  const { give, get } = sidesFor(me, agreement.terms);
  const cash = cashLabel(agreement.terms.cash, me, other);
  return (
    <li>
      <Link
        href={`/agreements/${agreement.id}`}
        className="group flex items-center gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 transition hover:ring-accent-primary/40"
      >
        <MemberInitial name={other} size="lg" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words font-semibold">{title}</span>
            <span className="text-body-sm text-text-secondary">with {other}</span>
            <AgreementStatusBadge status={agreement.status} />
            {agreement.waits_on_viewer ? (
              <span className="text-caption font-semibold text-accent-primary">
                Needs you
              </span>
            ) : null}
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
            dateTime={agreement.updated_at}
            className="text-caption text-text-muted"
          >
            Updated {formatWhen(agreement.updated_at)}
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
