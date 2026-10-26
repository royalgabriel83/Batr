import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import { EmptyState } from "@/components/ui";
import { requireMember } from "@/server/auth";
import { loadSafetyStatus, loadSuspensions } from "@/server/safety/queries";
import { SuspensionList } from "./SuspensionList";

// Suspensions in force (milestone-6.md, S5): lifting one needs a note
// and is logged. A moderator lifts their own; only a senior moderator
// lifts someone else's or records an appeal (milestone 8, W8 and W9).
// Moderators only.

export const metadata: Metadata = { title: `Suspended members · ${PRODUCT_NAME}`, robots: { index: false } };

export default async function SuspensionsPage() {
  await requireMember("/moderation/suspensions");
  const [suspensions, status] = await Promise.all([loadSuspensions(), loadSafetyStatus()]);
  if (suspensions === null) notFound();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <Link href="/moderation" className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Cases
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-body-sm font-semibold text-accent-primary">BATR staff</p>
        <h1 className="text-h1 md:text-h2-lg">Suspended members</h1>
        <p className="text-body-sm text-text-secondary">
          A suspended member can ask for one review by email. {status.senior ? "Record the outcome here." : "A senior moderator records the outcome."}
        </p>
      </div>
      {suspensions.length === 0 ? (
        <EmptyState icon={<ShieldCheck aria-hidden="true" />} title="No one is suspended">
          Members suspended from a case appear here.
        </EmptyState>
      ) : (
        <SuspensionList suspensions={suspensions} senior={status.senior} />
      )}
    </main>
  );
}
