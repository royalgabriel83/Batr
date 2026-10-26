import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PRODUCT_NAME } from "@batr/shared";
import { FormAlert } from "@/components/ui";
import { OfferDetail } from "@/components/offers/OfferDetail";
import { OfferStatusBadge } from "@/components/offers/OfferStatusBadge";
import { requireMember } from "@/server/auth";
import { loadOwnOffer } from "@/server/offers/queries";
import { OfferEditor } from "../../OfferEditor";

export const metadata: Metadata = { title: `Edit offer · ${PRODUCT_NAME}` };

export default async function EditOfferPage({ params }: PageProps<"/offers/[id]/edit">) {
  const { id } = await params;
  const member = await requireMember(`/offers/${id}/edit`);
  const lookup = await loadOwnOffer(member.id, id);
  if (lookup.kind === "missing") notFound();
  if (lookup.kind === "not_owner") {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-12 md:px-6">
        <h1 className="text-h1">You can&apos;t change this offer</h1>
        <p className="text-body text-text-secondary">Only the member who created an offer can edit it.</p>
        <Link href="/my-offers" className="text-body-sm font-semibold text-accent-primary underline">
          Go to My offers
        </Link>
      </main>
    );
  }
  const { offer } = lookup;
  if (offer.status === "closed") {
    // Closed is final: nothing about the offer can change (state-model.md §2).
    return (
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1">Closed offer</h1>
          <OfferStatusBadge status="closed" />
        </div>
        <FormAlert tone="info">Closed offers can&apos;t be edited or reopened. Others can no longer see this offer.</FormAlert>
        <OfferDetail {...offer} headingLevel={2} photos={offer.photos.map((p) => ({ key: p.id, src: p.url, alt: p.alt_text }))} />
      </main>
    );
  }
  return <OfferEditor key={offer.id} initialOffer={offer} owner={offer.owner} />;
}
