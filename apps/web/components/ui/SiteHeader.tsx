"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftRight, Bell, Bookmark, Compass, LayoutGrid, MessageCircle, Plus } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import inkLogo from "@/public/brand/logo-horizontal-ink.png";
import { cx } from "./cx";
import { AccountMenu } from "./AccountMenu";

export interface SiteHeaderProps {
  /** The signed-in member, or null when signed out. */
  member: { displayName: string | null } | null;
  /** Ends this browser's session, from the account menu. */
  signOut: () => Promise<void>;
  /** Proposals waiting on the member (Milestone 3, P5). */
  exchangesCount?: number;
  /** Conversations with unread messages (Milestone 5, N2). */
  messagesCount?: number;
  /** Unread notifications (Milestone 5). */
  notificationsCount?: number;
  /** Shows Moderation in the account menu (Milestone 6, S4). */
  moderator?: boolean;
}

// Auth screens keep their own dark brand frame (owner, 2026-10-17).
const AUTH_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

/**
 * Global header in the approved reference style (owner, 2026-10-17): a
 * white bar with the horizontal ink logo, used as supplied (the ink
 * logo belongs on light backgrounds; ui-context.md, Brand Assets).
 * The current section is marked with a green underline. On phones the
 * links move to the tab bar at the bottom (TabBar), leaving the logo
 * and the account menu. Messages and the notification bell (Milestone
 * 5) stay in the header on phones too, because the tab bar is full.
 */
export function SiteHeader({ member, signOut, exchangesCount = 0, messagesCount = 0, notificationsCount = 0, moderator = false }: SiteHeaderProps) {
  const pathname = usePathname();
  const onAuth = AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const current = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  return (
    <header
      className={cx(
        "sticky top-0 z-30 border-b bg-bg-surface",
        onAuth ? "border-transparent" : "border-border-default",
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:h-[4.5rem] md:px-6 lg:px-8">
        <Link href="/" className="flex h-11 shrink-0 items-center rounded-md">
          <Image src={inkLogo} alt={`${PRODUCT_NAME} home`} sizes="96px" priority className="h-7 w-auto md:h-8" />
        </Link>
        <nav aria-label="Main" className="min-w-0">
          <ul className="flex items-center gap-0.5 sm:gap-1">
            <NavLink href="/explore" icon={<Compass aria-hidden="true" className="size-5" />} current={current("/explore")}>
              Explore
            </NavLink>
            {member ? (
              <>
                <NavLink href="/saved" icon={<Bookmark aria-hidden="true" className="size-5" />} current={current("/saved")}>
                  Saved
                </NavLink>
                <NavLink
                  href="/exchanges"
                  icon={<ArrowLeftRight aria-hidden="true" className="size-5" />}
                  current={current("/exchanges")}
                  count={exchangesCount}
                >
                  Exchanges
                </NavLink>
                <NavLink
                  href="/messages"
                  icon={<MessageCircle aria-hidden="true" className="size-5" />}
                  current={current("/messages")}
                  count={messagesCount}
                  countLabel="unread"
                >
                  Messages
                </NavLink>
                <NavLink
                  href="/my-offers"
                  icon={<LayoutGrid aria-hidden="true" className="size-5" />}
                  current={current("/my-offers")}
                >
                  My offers
                </NavLink>
                <li className="max-md:hidden md:ml-2">
                  <Link
                    href="/offers/new"
                    className="inline-flex size-11 items-center justify-center gap-2 rounded-full bg-accent-primary text-body-sm font-semibold text-text-on-accent shadow-sm transition hover:bg-accent-primary-hover md:h-11 md:w-auto md:px-5"
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    <span className="sr-only md:not-sr-only">Create offer</span>
                  </Link>
                </li>
                <IconLink
                  href="/messages"
                  label="Messages"
                  icon={<MessageCircle aria-hidden="true" className="size-5" />}
                  current={current("/messages")}
                  count={messagesCount}
                  className="md:hidden"
                />
                <IconLink
                  href="/notifications"
                  label="Notifications"
                  icon={<Bell aria-hidden="true" className="size-5" />}
                  current={current("/notifications")}
                  count={notificationsCount}
                />
                <li>
                  <AccountMenu displayName={member.displayName} signOut={signOut} current={current("/account")} moderator={moderator} />
                </li>
              </>
            ) : (
              <li className="ml-1">
                <Link
                  href="/sign-in"
                  className="inline-flex h-11 items-center rounded-full border border-border-strong/60 px-5 text-body-sm font-semibold text-text-primary transition hover:border-accent-primary hover:text-accent-primary"
                >
                  Sign in
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function NavLink({
  href,
  icon,
  current,
  count = 0,
  countLabel,
  children,
}: {
  href: string;
  icon: ReactNode;
  current: boolean;
  count?: number;
  countLabel?: string;
  children: string;
}) {
  return (
    <li className="max-md:hidden">
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cx(
          "relative inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2.5 text-body-sm font-semibold transition-colors md:px-3.5",
          current ? "text-accent-primary" : "text-text-secondary hover:text-text-primary",
        )}
      >
        <span className="md:hidden">{icon}</span>
        <span className="sr-only md:not-sr-only">{children}</span>
        <CountBadge count={count} label={countLabel} />
        {current ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-3.5 bottom-1 hidden h-0.5 rounded-full bg-accent-primary md:block"
          />
        ) : null}
      </Link>
    </li>
  );
}

/** An icon-only header link with a count, on every width (Messages on phones, the bell). */
function IconLink({
  href,
  label,
  icon,
  current,
  count,
  className,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  current: boolean;
  count: number;
  className?: string;
}) {
  return (
    <li className={className}>
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cx(
          "relative inline-flex size-11 items-center justify-center rounded-full transition-colors",
          current ? "text-accent-primary" : "text-text-secondary hover:text-text-primary",
        )}
      >
        {icon}
        <span className="sr-only">{label}</span>
        <CountBadge count={count} label="unread" className="absolute -top-0.5 -right-0.5" />
      </Link>
    </li>
  );
}

/** The number waiting on the member, read as "3 waiting on you" (or "3 unread"). */
export function CountBadge({ count, label = "waiting on you", className }: { count: number; label?: string; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cx("min-w-5 rounded-full bg-accent-primary px-1.5 text-center text-caption leading-5 font-semibold text-text-on-accent tabular-nums", className)}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> {label}</span>
    </span>
  );
}
