import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import { ProposalComposer } from "@/components/proposals/ProposalComposer";
import { nameOr } from "@/lib/proposals/terms";
import { requireMember } from "@/server/auth";
import { loadOfferForViewer } from "@/server/offers/queries";
import {
  loadMyActiveOffers,
  loadOpenProposalId,
} from "@/server/proposals/queries";

export const metadata: Metadata = {
  title: `Propose an exchange · ${PRODUCT_NAME}`,
};

// The composer for a new proposal (specs/milestone-3.md, unit 15).
// Signed out, sign-in returns here. Only another member's active offer
// can receive one; a member with an open proposal on it is sent there.

export default async function ProposePage({
  params,
}: PageProps<"/offers/[id]/propose">) {
  const { id } = await params;
  const member = await requireMember(`/offers/${id}/propose`);
  const offer = await loadOfferForViewer(member.id, id);
  if (!offer || offer.status !== "active") notFound();
  if (offer.is_owner) redirect(`/offers/${offer.id}`);
  const existing = await loadOpenProposalId(offer.id, member.id);
  if (existing) redirect(`/exchanges/${existing}`);
  const choices = await loadMyActiveOffers(member.id);
  const owner = nameOr(offer.owner.display_name);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <Link
        href={`/offers/${offer.id}`}
        className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the offer
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 md:text-h2-lg">Propose an exchange</h1>
        <p className="text-body text-text-secondary">
          For {offer.title} from {owner}. Choose what you give, add anything
          extra, then check the terms before you send them.
        </p>
      </div>
      <ProposalComposer
        mode="create"
        viewerRole="proposer"
        otherName={owner}
        target={{
          id: offer.id,
          title: offer.title,
          thumb_url: offer.photos[0]?.thumb_url ?? null,
        }}
        choices={choices}
      />
    </main>
  );
}
