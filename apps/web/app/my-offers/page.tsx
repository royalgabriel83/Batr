import type { Metadata } from "next";
import Link from "next/link";
import { PackageOpen, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { PRODUCT_NAME, type OfferStatus } from "@batr/shared";
import { requireMember } from "@/server/auth";
import { loadMyOffers } from "@/server/offers/queries";
import { MyOfferRow } from "./MyOfferRow";

export const metadata: Metadata = { title: `My offers · ${PRODUCT_NAME}` };

// Grouped as in 02-offer-creation.md: Active, Drafts, Paused, Closed.
const GROUPS: { status: OfferStatus; heading: string }[] = [
  { status: "active", heading: "Active" },
  { status: "draft", heading: "Drafts" },
  { status: "paused", heading: "Paused" },
  { status: "closed", heading: "Closed" },
];

const createClasses =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent-primary px-4 text-body-sm font-semibold text-text-on-accent hover:bg-accent-primary-hover";

export default async function MyOffersPage() {
  const member = await requireMember("/my-offers");
  const offers = await loadMyOffers(member.id);
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pt-8 pb-12 md:px-6 md:pt-12 md:pb-16">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-h1 md:text-h2-lg">My offers</h1>
        {offers.length > 0 ? (
          <Link href="/offers/new" className={createClasses}>
            <Plus aria-hidden="true" className="size-4" />
            Create offer
          </Link>
        ) : null}
      </div>

      {offers.length === 0 ? (
        <EmptyState
          icon={<PackageOpen aria-hidden="true" />}
          title="You haven't created any offers yet"
          action={
            <Link href="/offers/new" className={createClasses}>
              <Plus aria-hidden="true" className="size-4" />
              Create your first offer
            </Link>
          }
        >
          Add photos, say what you&apos;re offering and what you&apos;d like in return.
        </EmptyState>
      ) : (
        GROUPS.map(({ status, heading }) => {
          const group = offers.filter((offer) => offer.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} aria-labelledby={`group-${status}`} className="flex flex-col gap-3">
              <h2 id={`group-${status}`} className="text-h3">
                {heading} <span className="text-body-sm font-normal text-text-secondary">({group.length})</span>
              </h2>
              <ul className="flex flex-col divide-y divide-border-default rounded-xl border border-border-default bg-bg-surface px-4 shadow-card md:px-5">
                {group.map((offer) => (
                  <MyOfferRow key={offer.id} offer={offer} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
