"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type MouseEvent, type ReactNode } from "react";
import { ArrowLeftRight, CircleCheck, CircleX, MessageCircle, PackageCheck, PencilLine } from "lucide-react";
import { notificationText, type NotificationKind } from "@batr/shared";
import { Button } from "@/components/ui";
import { apiRequest } from "@/lib/offers/api-client";
import { formatWhen } from "@/lib/proposals/terms";
import type { NotificationView } from "@/server/api/messages";

/** Where a notification leads: its agreement once there is one, else its proposal. */
export function notificationHref(notification: Pick<NotificationView, "kind" | "agreement_id" | "proposal_id">): string {
  const page = notification.agreement_id ? `/agreements/${notification.agreement_id}` : `/exchanges/${notification.proposal_id}`;
  return notification.kind === "message" ? `${page}#messages` : page;
}

function iconFor(kind: NotificationKind): ReactNode {
  const className = "size-5";
  if (kind === "message") return <MessageCircle aria-hidden="true" className={className} />;
  if (kind === "agreement.completed" || kind === "agreement.handover") return <PackageCheck aria-hidden="true" className={className} />;
  if (kind.endsWith("_cancel") || kind === "proposal.decline" || kind === "proposal.auto_decline")
    return <CircleX aria-hidden="true" className={className} />;
  if (kind.endsWith("_change")) return <PencilLine aria-hidden="true" className={className} />;
  if (kind === "proposal.accept") return <CircleCheck aria-hidden="true" className={className} />;
  return <ArrowLeftRight aria-hidden="true" className={className} />;
}

/**
 * The notification list (specs/milestone-5.md, user journey 4): newest
 * first, an icon for each kind, the line, the offer, when, and a dot
 * while unread. Opening one marks it read, then goes to its page.
 */
export function NotificationList({ items, unread }: { items: NotificationView[]; unread: number }) {
  const router = useRouter();
  const [read, setRead] = useState<Set<string>>(() => new Set(items.filter((n) => n.read).map((n) => n.id)));
  const [busy, setBusy] = useState(false);
  const remaining = items.filter((n) => !read.has(n.id)).length;

  async function readAll() {
    setBusy(true);
    const result = await apiRequest("/api/v1/notifications/read-all", { method: "POST" });
    setBusy(false);
    if (result.ok) {
      setRead(new Set(items.map((n) => n.id)));
      router.refresh();
    }
  }

  async function open(event: MouseEvent, notification: NotificationView) {
    if (read.has(notification.id) || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    // Best effort: the page opens whether or not this lands.
    await apiRequest(`/api/v1/notifications/${notification.id}/read`, { method: "POST" });
    router.push(notificationHref(notification));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {unread > 0 && remaining > 0 ? (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => void readAll()} loading={busy}>
            Mark all as read
          </Button>
        </div>
      ) : null}
      <ul aria-label="Notifications" className="flex flex-col overflow-hidden rounded-xl bg-bg-surface shadow-card ring-1 ring-border-default/70">
        {items.map((notification) => {
          const isRead = read.has(notification.id);
          return (
            <li key={notification.id} className="border-b border-border-default last:border-b-0">
              <Link
                href={notificationHref(notification)}
                onClick={(event) => void open(event, notification)}
                className={
                  "flex items-start gap-3 p-4 transition hover:bg-bg-subtle " + (isRead ? "" : "bg-accent-soft/40")
                }
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-accent-primary">
                  {iconFor(notification.kind)}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className={"text-body-sm break-words " + (isRead ? "text-text-secondary" : "font-semibold text-text-primary")}>
                    {notificationText(notification.kind, notification.actor_name, notification.count)}
                  </span>
                  <span className="truncate text-caption text-text-secondary">On {notification.offer_title}</span>
                  <time dateTime={notification.updated_at} className="text-caption text-text-muted">
                    {formatWhen(notification.updated_at)}
                  </time>
                </span>
                {isRead ? null : (
                  <span className="mt-2 size-2.5 shrink-0 rounded-full bg-accent-primary">
                    <span className="sr-only">Unread</span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
