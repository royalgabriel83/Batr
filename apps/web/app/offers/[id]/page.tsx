import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck, PencilLine } from "lucide-react";
import { PRODUCT_NAME, signInPathFor } from "@batr/shared";
import { OfferDetail } from "@/components/offers/OfferDetail";
import { OfferMarks } from "@/components/offers/OfferMarks";
import { OfferStatusBadge } from "@/components/offers/OfferStatusBadge";
import { ShareButton } from "@/components/offers/ShareButton";
import { ProposalRow } from "@/components/proposals/ProposalRow";
import { SafetyActions } from "@/components/safety/SafetyActions";
import { ExchangeIcon } from "@/components/ui/ExchangeIcon";
import { AssessedIndicator, ValuationSummary } from "@/components/valuation/ValuationSummary";
import { getCurrentMember } from "@/server/auth";
import { loadOfferForViewer } from "@/server/offers/queries";
import { loadOfferProposals, loadOpenProposalId } from "@/server/proposals/queries";
import { loadAssessmentIndicator, loadValuationSummary } from "@/server/valuation/queries";

// The offer page (01-marketplace-discovery.md, journey step 4; unit 08).
// Anyone can open an active offer; the owner can also open their own
// draft, paused or closed offer. Everyone else gets the same "isn't
// available" page whatever the reason, so a state is never revealed.
// Others can propose an exchange on an active offer; the owner sees
// every proposal on it (milestone-3.md, user journey 1; P6).

type Props = PageProps<"/offers/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const member = await getCurrentMember();
  const offer = await loadOfferForViewer(member?.id ?? null, id);
  return { title: `${offer?.title || "Offer not available"} · ${PRODUCT_NAME}` };
}

const proposeClasses =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent-primary px-5 text-body-sm font-semibold text-text-on-accent hover:bg-accent-primary-hover";

const editClasses =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border border-border-strong bg-bg-surface px-4 text-body-sm font-semibold text-text-primary hover:bg-bg-subtle";

export default async function OfferPage({ params }: Props) {
  const { id } = await params;
  const member = await getCurrentMember();
  const offer = await loadOfferForViewer(member?.id ?? null, id);
  if (!offer) notFound();
  const live = offer.status === "active";
  // The assessed value is for signed-in members only (owner, 2026-10-18);
  // visitors are told at most that BATR assessed the offer.
  const summary = member ? await loadValuationSummary(offer.id) : null;
  const assessedForVisitor = member ? false : await loadAssessmentIndicator(offer.id);
  const openProposal = member && live && !offer.is_owner ? await loadOpenProposalId(offer.id, member.id) : null;
  const proposals = offer.is_owner ? await loadOfferProposals(offer.id) : [];
  const propose = !live || offer.is_owner ? null : openProposal ? (
    <Link href={`/exchanges/${openProposal}`} className={proposeClasses}>
      <ExchangeIcon className="size-4" />
      View your proposal
    </Link>
  ) : (
    <Link href={member ? `/offers/${offer.id}/propose` : signInPathFor(`/offers/${offer.id}/propose`)} className={proposeClasses}>
      <ExchangeIcon className="size-4" />
      Propose an exchange
    </Link>
  );
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10 lg:px-8">
      <Link href="/explore" className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Explore
      </Link>

      {offer.is_owner ? (
        <section aria-label="Your offer" className="flex flex-wrap items-center gap-3 rounded-lg border border-border-default bg-bg-surface p-4">
          <OfferStatusBadge status={offer.status} removed={Boolean(offer.removed_at)} />
          <p className="flex-1 text-body-sm text-text-secondary">
            {offer.removed_at
              ? "BATR removed this offer because it broke the rules. Only you can see it."
              : live
                ? "This is your offer. Everyone can see it."
                : "This is your offer. Only you can see it while it isn't active."}
          </p>
          <Link href={`/offers/${offer.id}/valuation`} className={editClasses}>
            <BadgeCheck aria-hidden="true" className="size-4" />
            Valuation
          </Link>
          {offer.status === "closed" ? null : (
            <Link href={`/offers/${offer.id}/edit`} className={editClasses}>
              <PencilLine aria-hidden="true" className="size-4" />
              Edit offer
            </Link>
          )}
        </section>
      ) : null}

      <OfferDetail
        offer_type={offer.offer_type}
        title={offer.title}
        description={offer.description}
        category={offer.category}
        condition={offer.condition}
        offering_text={offer.offering_text}
        wants_text={offer.wants_text}
        area={offer.area}
        exchange_mode={offer.exchange_mode}
        handover_methods={offer.handover_methods}
        published_at={offer.published_at}
        photos={offer.photos.map((p) => ({ key: p.id, src: p.url, alt: p.alt_text }))}
        owner={offer.owner}
        offerId={offer.id}
        marks={
          live && !offer.is_owner ? (
            <OfferMarks offerId={offer.id} title={offer.title} liked={offer.liked} saved={offer.saved} guest={!member} size="detail" />
          ) : null
        }
        actions={
          live ? (
            <>
              {propose}
              <ShareButton path={`/offers/${offer.id}`} title={offer.title} variant="secondary" />
            </>
          ) : null
        }
        valuation={summary ? <ValuationSummary summary={summary} /> : assessedForVisitor ? <AssessedIndicator offerId={offer.id} /> : null}
      />

      {member && !offer.is_owner ? (
        <SafetyActions
          memberName={offer.owner.display_name ?? "this member"}
          report={{ target: { subject_type: "offer", offer_id: offer.id }, label: "Report offer", about: offer.title }}
          block={{ offer_id: offer.id }}
          afterBlock="explore"
          className="max-w-3xl border-t border-border-default pt-2"
        />
      ) : null}

      {offer.is_owner && proposals.length > 0 ? (
        <section aria-labelledby="offer-proposals" className="flex max-w-3xl flex-col gap-3">
          <h2 id="offer-proposals" className="text-h3">
            Proposals on this offer <span className="text-body-sm font-normal text-text-secondary">({proposals.length})</span>
          </h2>
          <ul className="flex flex-col gap-3">
            {proposals.map((proposal) => (
              <ProposalRow key={proposal.id} proposal={proposal} />
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
