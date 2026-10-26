import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import { requireMember } from "@/server/auth";
import { loadOwnOffer } from "@/server/offers/queries";
import { loadOwnValuation } from "@/server/valuation/queries";
import { ValuationWorkspace } from "./ValuationWorkspace";

// The owner's valuation of their offer (owner, 2026-10-17;
// specs/valuation-and-fees.md). Only the offer's owner can open it;
// anyone else gets the same "isn't available" page as a missing offer.

export const metadata: Metadata = { title: `Valuation · ${PRODUCT_NAME}` };

export default async function ValuationPage({ params }: PageProps<"/offers/[id]/valuation">) {
  const { id } = await params;
  const member = await requireMember(`/offers/${id}/valuation`);
  const lookup = await loadOwnOffer(member.id, id);
  if (lookup.kind !== "own") notFound();
  const valuation = await loadOwnValuation(id);
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10 lg:px-8">
      <Link href={`/offers/${id}`} className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the offer
      </Link>
      <div className="flex flex-col gap-1">
        <p className="text-body-sm font-semibold text-accent-primary">Valuation</p>
        <h1 className="text-h1 break-words md:text-h2-lg">{lookup.offer.title || "Untitled offer"}</h1>
      </div>
      <ValuationWorkspace offerId={id} initial={valuation} offerClosed={lookup.offer.status === "closed"} />
    </main>
  );
}
