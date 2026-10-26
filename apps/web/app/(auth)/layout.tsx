import Image from "next/image";
import type { ReactNode } from "react";
import brandIcon from "@/public/brand/icon-compact.png";

// Auth screens (specs/05-auth-and-permissions.md, Design and UI
// States), in the approved reference style (owner, 2026-10-17): one
// white card split with a dark green brand panel. The panel carries the
// compact brand icon, which is the form of the logo that belongs on
// dark surfaces; on phones it shrinks to a short band above the form.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-3 pb-12 md:px-6 md:pt-8">
      <div className="grid overflow-hidden rounded-xl bg-bg-surface shadow-card ring-1 ring-border-default/70 lg:min-h-[36rem] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)]">
        <section
          aria-hidden="true"
          className="relative flex items-center gap-4 overflow-hidden bg-bg-inverse px-6 py-5 text-text-on-inverse lg:flex-col lg:items-start lg:justify-between lg:p-12"
        >
          <div className="pointer-events-none absolute -bottom-56 -left-40 size-[34rem] rounded-full bg-[radial-gradient(closest-side,var(--color-accent-on-inverse),transparent)] opacity-[0.12]" />
          <Image src={brandIcon} alt="" priority sizes="64px" className="relative size-11 lg:size-16" />
          <div className="relative flex flex-col gap-3">
            <p className="font-display text-h3 leading-tight font-medium lg:text-h2-lg lg:font-normal">
              Offer what you have. <span className="text-accent-on-inverse">Find what you need.</span>
            </p>
            <p className="hidden max-w-xs text-body text-text-on-inverse-muted lg:block">
              Members post what they can give and say what they&apos;d like in return.
            </p>
          </div>
        </section>
        <div className="flex flex-col justify-center p-6 md:p-10 lg:p-14">{children}</div>
      </div>
    </main>
  );
}
