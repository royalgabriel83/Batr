import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Ban } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import { EmptyState } from "@/components/ui";
import { requireMember } from "@/server/auth";
import { loadBlockedMembers } from "@/server/safety/queries";
import { BlockedList } from "./BlockedList";

// Account → Blocked members (milestone-6.md, S2): unblock any time.

export const metadata: Metadata = { title: `Blocked members · ${PRODUCT_NAME}` };

export default async function BlockedMembersPage() {
  await requireMember("/account/blocked");
  const blocks = await loadBlockedMembers();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pt-6 pb-12 md:px-6 md:pt-10 md:pb-16">
      <Link href="/account" className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Your account
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 md:text-h2-lg">Blocked members</h1>
        <p className="text-body-sm text-text-secondary">
          You and a blocked member can&apos;t send each other proposals or messages, or see each other&apos;s offers. They aren&apos;t told.
        </p>
      </div>
      {blocks.length === 0 ? (
        <EmptyState icon={<Ban aria-hidden="true" />} title="No one is blocked">
          You can block a member from their offer, a proposal or an agreement.
        </EmptyState>
      ) : (
        <BlockedList blocks={blocks} />
      )}
    </main>
  );
}
