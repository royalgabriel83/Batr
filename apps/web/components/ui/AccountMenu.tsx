"use client";

import Link from "next/link";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Bookmark, LayoutGrid, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { cx } from "./cx";
import { MemberInitial } from "./MemberInitial";

export interface AccountMenuProps {
  displayName: string | null;
  /** Ends this browser's session (app/account/actions.ts). */
  signOut: () => Promise<void>;
  current: boolean;
  /** BATR moderators also get the moderation workspace (milestone-6.md, S4). */
  moderator?: boolean;
}

const itemClasses =
  "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-body-sm font-medium text-text-primary outline-none hover:bg-bg-subtle focus-visible:bg-bg-subtle";

/**
 * The member's menu under their initial (owner, 2026-10-20): their
 * account, offers and saved offers, and signing out. Follows the
 * WAI-ARIA menu button pattern: Enter, Space or Down opens it on the
 * first item, arrows and Home/End move, Escape closes it and returns
 * focus, and a click outside closes it.
 */
export function AccountMenu({ displayName, signOut, current, moderator = false }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function onMenuKey(event: KeyboardEvent) {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const go = (index: number) => items[(index + items.length) % items.length]?.focus();
    if (event.key === "ArrowDown") go(at + 1);
    else if (event.key === "ArrowUp") go(at - 1);
    else if (event.key === "Home") go(0);
    else if (event.key === "End") go(items.length - 1);
    else if (event.key === "Escape") {
      setOpen(false);
      button.current?.focus();
    } else if (event.key === "Tab") setOpen(false);
    else return;
    if (event.key !== "Tab") event.preventDefault();
  }

  const name = displayName ? `${displayName}, your account` : "Your account";
  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="inline-flex size-11 items-center justify-center rounded-full transition-colors duration-fast hover:bg-bg-subtle"
      >
        <MemberInitial name={displayName} size="lg" className={cx("size-9", (current || open) && "border-accent-primary text-accent-primary")} />
        <span className="sr-only">{name}</span>
      </button>
      <div
        ref={menu}
        id={id}
        role="menu"
        aria-label="Your account"
        hidden={!open}
        onKeyDown={onMenuKey}
        // Choosing an item closes the menu.
        onClick={(event) => (event.target as HTMLElement).closest('[role="menuitem"]') && setOpen(false)}
        className="absolute top-full right-0 z-40 mt-2 w-60 origin-top-right animate-menu-in rounded-xl bg-bg-surface p-1.5 shadow-lg ring-1 ring-border-default"
      >
        <p className="truncate px-3 pt-2 pb-2.5 text-caption text-text-muted" role="presentation">
          Signed in as <span className="font-semibold text-text-primary">{displayName ?? "BATR member"}</span>
        </p>
        <Link role="menuitem" tabIndex={-1} href="/account" className={itemClasses}>
          <UserRound aria-hidden="true" className="size-4 text-text-muted" />
          Your account
        </Link>
        <Link role="menuitem" tabIndex={-1} href="/my-offers" className={itemClasses}>
          <LayoutGrid aria-hidden="true" className="size-4 text-text-muted" />
          My offers
        </Link>
        <Link role="menuitem" tabIndex={-1} href="/saved" className={itemClasses}>
          <Bookmark aria-hidden="true" className="size-4 text-text-muted" />
          Saved
        </Link>
        {moderator ? (
          <Link role="menuitem" tabIndex={-1} href="/moderation" className={itemClasses}>
            <ShieldCheck aria-hidden="true" className="size-4 text-text-muted" />
            Moderation
          </Link>
        ) : null}
        <div role="separator" className="my-1.5 h-px bg-border-default" />
        <form action={signOut} role="presentation">
          <button type="submit" role="menuitem" tabIndex={-1} className={itemClasses}>
            <LogOut aria-hidden="true" className="size-4 text-text-muted" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
