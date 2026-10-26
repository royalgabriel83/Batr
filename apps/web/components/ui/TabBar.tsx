"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowLeftRight, Compass, House, LayoutGrid, LogIn, Plus } from "lucide-react";
import { cx } from "./cx";
import { CountBadge } from "./SiteHeader";

export interface TabBarProps {
  signedIn: boolean;
  /** Proposals waiting on the member (Milestone 3, P5). */
  exchangesCount?: number;
}

// Screens with their own bottom bar or brand frame keep the full height.
const HIDDEN = [/^\/sign-in/, /^\/sign-up/, /^\/forgot-password/, /^\/reset-password/, /^\/offers\/new$/, /^\/offers\/[^/]+\/edit$/];

/**
 * Phone navigation (owner, 2026-10-20): a labelled tab bar fixed to the
 * bottom of the screen below `md`, so every main destination is one
 * thumb's reach away. Create sits in the middle as the main action.
 * Exchanges, with the count waiting on the member, took Saved's place
 * in Milestone 3; Saved stays in the account menu. Wider screens use
 * the header links instead.
 */
export function TabBar({ signedIn, exchangesCount = 0 }: TabBarProps) {
  // Null only outside the app router (Storybook's router mock).
  const pathname = (usePathname() as string | null) ?? "/";
  if (HIDDEN.some((pattern) => pattern.test(pathname))) return null;
  const current = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <>
      {/* Keeps the end of every page clear of the bar. */}
      <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border-default bg-bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="mx-auto grid h-16 max-w-md grid-cols-5 items-stretch px-1">
          <Tab href="/" label="Home" icon={<House className="size-5" />} current={current("/")} />
          <Tab href="/explore" label="Explore" icon={<Compass className="size-5" />} current={current("/explore")} />
          <li className="flex items-center justify-center">
            <Link
              href="/offers/new"
              prefetch={false}
              className="flex size-12 items-center justify-center rounded-full bg-accent-primary text-text-on-accent shadow-card transition-transform duration-fast ease-standard active:scale-95"
            >
              <Plus aria-hidden="true" className="size-6" />
              <span className="sr-only">Create offer</span>
            </Link>
          </li>
          {signedIn ? (
            <>
              <Tab href="/exchanges" label="Exchanges" icon={<ArrowLeftRight className="size-5" />} current={current("/exchanges")} count={exchangesCount} />
              <Tab href="/my-offers" label="My offers" icon={<LayoutGrid className="size-5" />} current={current("/my-offers")} />
            </>
          ) : (
            <>
              <li aria-hidden="true" />
              <Tab href="/sign-in" label="Sign in" icon={<LogIn className="size-5" />} current={false} />
            </>
          )}
        </ul>
      </nav>
    </>
  );
}

function Tab({ href, label, icon, current, count = 0 }: { href: string; label: string; icon: ReactNode; current: boolean; count?: number }) {
  return (
    <li className="flex">
      <Link
        href={href}
        aria-current={current ? "page" : undefined}
        className={cx(
          "relative flex flex-1 flex-col items-center justify-center gap-1 text-caption leading-none font-semibold transition-colors duration-fast",
          current ? "text-accent-primary" : "text-text-muted hover:text-text-primary",
        )}
      >
        <span aria-hidden="true" className={cx("transition-transform duration-base ease-emphasized", current && "-translate-y-0.5")}>
          {icon}
        </span>
        {label}
        <CountBadge count={count} className="absolute top-1.5 left-1/2 ml-1.5" />
        {current ? <span aria-hidden="true" className="absolute top-0 h-0.5 w-8 rounded-full bg-accent-primary" /> : null}
      </Link>
    </li>
  );
}
