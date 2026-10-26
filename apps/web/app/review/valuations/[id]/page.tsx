import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import { requireMember } from "@/server/auth";
import { loadReview } from "@/server/valuation/queries";
import { ReviewWorkspace } from "./ReviewWorkspace";

// The reviewer workspace for one valuation (owner, 2026-10-17). BATR
// staff only; members get the not-found page, so the area is never
// revealed. Staff never open their own valuations.

export const metadata: Metadata = { title: `Review valuation · ${PRODUCT_NAME}`, robots: { index: false } };

export default async function ReviewValuationPage({ params }: PageProps<"/review/valuations/[id]">) {
  const { id } = await params;
  await requireMember(`/review/valuations/${id}`);
  const lookup = await loadReview(id);
  if (lookup.kind === "forbidden" || lookup.kind === "missing") notFound();
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10 lg:px-8">
      <Link href="/review" className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the queue
      </Link>
      {lookup.kind === "own" ? (
        <>
          <h1 className="text-h1">This is your own valuation</h1>
          <p className="text-body text-text-secondary">Another reviewer has to review it.</p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="text-body-sm font-semibold text-accent-primary">Review valuation</p>
            <h1 className="text-h1 break-words md:text-h2-lg">{lookup.valuation.offer.title || "Untitled offer"}</h1>
          </div>
          <ReviewWorkspace initial={lookup.valuation} />
        </>
      )}
    </main>
  );
}
