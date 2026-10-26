import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronRight, MessagesSquare } from "lucide-react";
import { PRODUCT_NAME, systemLineText, type SystemEvent } from "@batr/shared";
import { EmptyState, MemberInitial } from "@/components/ui";
import { formatWhen, nameOr } from "@/lib/proposals/terms";
import { requireMember } from "@/server/auth";
import { loadThreads } from "@/server/proposals/queries";

export const metadata: Metadata = { title: `Messages · ${PRODUCT_NAME}` };

// The Messages page (specs/milestone-5.md, N2): every conversation,
// latest activity first, with the other member, the offer, the last
// line and the unread count. Each opens its agreement, or its proposal
// while there is none, at the conversation.

const olderClasses =
  "inline-flex h-11 items-center gap-2 self-center rounded-full border border-border-strong px-5 text-body-sm font-semibold hover:bg-bg-subtle";

export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const query = await searchParams;
  const cursor = typeof query.cursor === "string" ? query.cursor : null;
  await requireMember("/messages");
  const { threads, next_cursor } = await loadThreads(cursor);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-8 pb-12 md:px-6 md:pt-12 md:pb-16">
      <h1 className="text-h1 md:text-h2-lg">Messages</h1>
      {threads.length === 0 && !cursor ? (
        <EmptyState icon={<MessagesSquare aria-hidden="true" />} title="No conversations yet">
          When you propose on an offer, or someone proposes on yours, you can message each other here.
        </EmptyState>
      ) : (
        <>
          <ul aria-label="Conversations" className="flex flex-col gap-3">
            {threads.map((thread) => {
              const other = nameOr(thread.other_name);
              const last = thread.last;
              const line =
                last.kind === "text"
                  ? `${last.from === "you" ? "You: " : ""}${last.body ?? ""}`
                  : systemLineText(last.event as SystemEvent, last.actor, other);
              const href = thread.agreement_id
                ? `/agreements/${thread.agreement_id}#messages`
                : `/exchanges/${thread.proposal_id}#messages`;
              return (
                <li key={thread.proposal_id}>
                  <Link
                    href={href}
                    className="group flex items-center gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 transition hover:ring-accent-primary/40"
                  >
                    <MemberInitial name={other} size="lg" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold">{other}</span>
                        <time dateTime={last.created_at} className="shrink-0 text-caption text-text-muted">
                          {formatWhen(last.created_at)}
                        </time>
                      </span>
                      <span className="truncate text-caption text-text-secondary">On {thread.offer_title}</span>
                      <span className="flex items-center gap-2">
                        <span
                          className={
                            "min-w-0 flex-1 truncate text-body-sm " +
                            (thread.unread > 0 ? "font-semibold text-text-primary" : "text-text-secondary")
                          }
                        >
                          {line}
                        </span>
                        {thread.unread > 0 ? (
                          <span className="min-w-5 rounded-full bg-accent-primary px-1.5 text-center text-caption leading-5 font-semibold text-text-on-accent tabular-nums">
                            {thread.unread}
                            <span className="sr-only"> unread</span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <ChevronRight
                      aria-hidden="true"
                      className="size-5 shrink-0 text-text-muted transition group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          {next_cursor ? (
            <Link href={`/messages?cursor=${encodeURIComponent(next_cursor)}`} className={olderClasses}>
              Show older
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </>
      )}
    </main>
  );
}
