import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bell } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import { NotificationList } from "@/components/messages/NotificationList";
import { EmptyState } from "@/components/ui";
import { requireMember } from "@/server/auth";
import { loadNotifications } from "@/server/proposals/queries";

export const metadata: Metadata = { title: `Notifications · ${PRODUCT_NAME}` };

// In-app notifications (specs/milestone-5.md, unit 22; N7 and N8): the
// bell in the header opens this list.

const olderClasses =
  "inline-flex h-11 items-center gap-2 self-center rounded-full border border-border-strong px-5 text-body-sm font-semibold hover:bg-bg-subtle";

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const query = await searchParams;
  const cursor = typeof query.cursor === "string" ? query.cursor : null;
  await requireMember("/notifications");
  const page = await loadNotifications(cursor);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-8 pb-12 md:px-6 md:pt-12 md:pb-16">
      <h1 className="text-h1 md:text-h2-lg">Notifications</h1>
      {page.notifications.length === 0 && !cursor ? (
        <EmptyState icon={<Bell aria-hidden="true" />} title="You're all caught up">
          Proposals, replies, messages and agreement updates appear here.
        </EmptyState>
      ) : (
        <>
          <NotificationList key={cursor ?? "first"} items={page.notifications} unread={page.unread} />
          {page.next_cursor ? (
            <Link href={`/notifications?cursor=${encodeURIComponent(page.next_cursor)}`} className={olderClasses}>
              Show older
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          ) : null}
        </>
      )}
    </main>
  );
}
