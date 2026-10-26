import type { Metadata } from "next";
import Link from "next/link";
import { Ban, ChevronRight, Flag, LogOut, ScrollText } from "lucide-react";
import { AUTH_MESSAGES, PRODUCT_NAME } from "@batr/shared";
import { Button, FormAlert } from "@/components/ui";
import { firstParam } from "@/lib/forms/search-params";
import { requireMember } from "@/server/auth";
import { signOut } from "./actions";
import { DisplayNameForm } from "./DisplayNameForm";

export const metadata: Metadata = { title: `Your account · ${PRODUCT_NAME}` };

// Milestone 6 (S2, S7, S9).
const SAFETY_LINKS = [
  { href: "/account/blocked", label: "Blocked members", detail: "People who can't contact you", Icon: Ban },
  { href: "/account/reports", label: "My reports", detail: "What you've reported to BATR", Icon: Flag },
  { href: "/rules", label: "What can't be offered", detail: "Items BATR doesn't allow", Icon: ScrollText },
];

const memberSinceFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const member = await requireMember("/account");
  // Set by the reset-password action after a successful change.
  const passwordChanged = firstParam((await searchParams).changed) === "password";
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 pt-8 pb-12 md:px-6 md:pt-12 md:pb-16">
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 md:text-h2-lg">Your account</h1>
        <p className="text-body-sm text-text-secondary">
          Member since {memberSinceFormat.format(new Date(member.memberSince))}
        </p>
      </div>

      {passwordChanged ? <FormAlert tone="success">{AUTH_MESSAGES.passwordChanged}</FormAlert> : null}

      {member.displayName ? null : (
        <FormAlert tone="info">Choose a display name. Other members see it on your offers.</FormAlert>
      )}

      <div className="flex flex-col rounded-xl border border-border-default bg-bg-surface px-5 shadow-card md:px-6">
        <div className="py-5">
          <DisplayNameForm current={member.displayName} />
        </div>
        <dl className="grid gap-1 border-t border-border-default py-5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-6">
          <dt className="text-body-sm text-text-secondary">Email</dt>
          <dd className="text-body break-words">{member.email}</dd>
        </dl>
      </div>

      <section aria-labelledby="safety-heading" className="flex flex-col gap-3">
        <h2 id="safety-heading" className="text-h3">
          Safety
        </h2>
        <ul className="flex flex-col divide-y divide-border-default rounded-xl border border-border-default bg-bg-surface shadow-card">
          {SAFETY_LINKS.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="flex min-h-14 items-center gap-3 px-5 py-3 hover:bg-bg-subtle md:px-6">
                <link.Icon aria-hidden="true" className="size-5 shrink-0 text-text-muted" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body font-semibold">{link.label}</span>
                  <span className="text-caption text-text-secondary">{link.detail}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <form action={signOut}>
        <Button type="submit" variant="secondary" icon={<LogOut aria-hidden="true" className="size-4" />}>
          Sign out
        </Button>
      </form>
    </main>
  );
}
