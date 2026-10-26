import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import { ShareButton } from "@/components/offers/ShareButton";
import { requireMember } from "@/server/auth";
import { loadOwnOffer } from "@/server/offers/queries";

export const metadata: Metadata = {
  title: `Offer published · ${PRODUCT_NAME}`,
};

const linkClasses =
  "inline-flex h-11 items-center justify-center rounded-full px-4 text-body-sm font-semibold";

export default async function PublishedPage({
  params,
}: PageProps<"/offers/[id]/published">) {
  const { id } = await params;
  const member = await requireMember(`/offers/${id}/published`);
  const lookup = await loadOwnOffer(member.id, id);
  if (lookup.kind !== "own") notFound();
  const { offer } = lookup;
  const live = offer.status === "active";
  return (
    <main className="mx-auto max-w-2xl px-4 pt-8 pb-12 md:px-6 md:pt-16 md:pb-20">
      <div className="flex flex-col items-start gap-6 rounded-xl border border-border-default bg-bg-surface p-6 shadow-card md:p-10">
        <CircleCheck aria-hidden="true" className="size-8 text-state-success" />
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 md:text-h2-lg">
            {live ? "Your offer is live" : "Offer saved"}
          </h1>
          <p className="text-body text-text-secondary">
            {live ? (
              <>
                <span className="font-semibold text-text-primary">
                  {offer.title}
                </span>{" "}
                is now visible to everyone in the marketplace.
              </>
            ) : (
              "This offer isn't active right now. You can manage it from My offers."
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {live ? (
            <>
              <Link
                href={`/offers/${offer.id}`}
                className={`${linkClasses} bg-accent-primary text-text-on-accent`}
              >
                View offer
              </Link>
              <ShareButton path={`/offers/${offer.id}`} title={offer.title} />
            </>
          ) : null}
          <Link
            href="/my-offers"
            className={`${linkClasses} ${live ? "border border-border-strong bg-bg-surface text-text-primary" : "bg-accent-primary text-text-on-accent"}`}
          >
            Go to My offers
          </Link>
          <Link
            href={`/offers/${offer.id}/edit`}
            className={`${linkClasses} border border-border-strong bg-bg-surface text-text-primary`}
          >
            Edit offer
          </Link>
          <Link
            href="/offers/new"
            className={`${linkClasses} text-accent-primary`}
          >
            Create another offer
          </Link>
        </div>
      </div>
    </main>
  );
}
