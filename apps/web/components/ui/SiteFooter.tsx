"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRODUCT_NAME } from "@batr/shared";
import inkLogo from "@/public/brand/logo-horizontal-ink.png";

// Auth screens keep their dark brand frame and have no footer (owner, 2026-10-17).
const AUTH_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"];

const linkClasses = "inline-flex h-11 items-center text-body-sm text-text-secondary hover:text-text-primary hover:underline";

/**
 * White footer with the horizontal ink logo, used as supplied (the ink
 * logo belongs on light backgrounds; ui-context.md, Brand Assets).
 * No trust claims.
 */
export function SiteFooter() {
  const pathname = usePathname();
  if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;
  return (
    <footer className="border-t border-border-default bg-bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between md:px-6 lg:px-8">
        <Link href="/" className="self-start rounded-md sm:self-auto">
          <Image src={inkLogo} alt={`${PRODUCT_NAME} home`} sizes="83px" className="h-7 w-auto" />
        </Link>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-6">
            <li>
              <Link href="/explore" className={linkClasses}>
                Explore
              </Link>
            </li>
            <li>
              {/* Not prefetched: signed out, it only redirects to sign-in. */}
              <Link href="/offers/new" prefetch={false} className={linkClasses}>
                Create an offer
              </Link>
            </li>
            <li className="text-body-sm text-text-muted">
              © {new Date().getFullYear()} {PRODUCT_NAME}
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
