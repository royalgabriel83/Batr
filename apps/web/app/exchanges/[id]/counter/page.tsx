import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import {
  ProposalComposer,
  type OfferOption,
} from "@/components/proposals/ProposalComposer";
import {
  nameOr,
  otherRole,
  type ItemView,
  type RevisionView,
} from "@/lib/proposals/terms";
import { requireMember } from "@/server/auth";
import { loadProposal } from "@/server/proposals/queries";

export const metadata: Metadata = { title: `Counter · ${PRODUCT_NAME}` };

// Counter: the composer prefilled with the latest terms (specs/
// milestone-3.md, user journey 4). Only the member whose turn it is.

const offers = (items: ItemView[]) =>
  items.filter(
    (item): item is Extract<ItemView, { kind: "offer" }> =>
      item.kind === "offer",
  );
const texts = (items: ItemView[]) =>
  items.flatMap((item) => (item.kind === "text" ? [item.description] : []));
const asOption = (item: Extract<ItemView, { kind: "offer" }>): OfferOption => ({
  id: item.offer_id,
  title: item.snapshot.title,
  thumb_url: item.snapshot.photo?.thumb_url ?? null,
});

export default async function CounterPage({
  params,
}: PageProps<"/exchanges/[id]/counter">) {
  const { id } = await params;
  await requireMember(`/exchanges/${id}/counter`);
  const proposal = await loadProposal(id);
  if (!proposal) notFound();
  if (!proposal.actions.counter) redirect(`/exchanges/${proposal.id}`);
  const latest = proposal.revisions.at(-1) as RevisionView;
  const other = nameOr(proposal[otherRole(proposal.viewer_role)].display_name);
  const target = offers(latest.gets)[0];
  if (!target) notFound();
  // The proposer's active offers, plus any offer already in the terms.
  const choices = [...proposal.gives_choices];
  for (const item of offers(latest.gives))
    if (!choices.some((offer) => offer.id === item.offer_id))
      choices.push(asOption(item));
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <Link
        href={`/exchanges/${proposal.id}`}
        className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the exchange
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 md:text-h2-lg">Counter with new terms</h1>
        <p className="text-body text-text-secondary">
          Start from the latest terms with {other}. Change an item or the cash,
          then check the terms before you send them.
        </p>
      </div>
      <ProposalComposer
        mode="counter"
        viewerRole={proposal.viewer_role}
        otherName={other}
        target={{
          ...asOption(target),
          title: proposal.offer?.title ?? target.snapshot.title,
        }}
        choices={choices}
        start={{
          proposerOffers: offers(latest.gives).map((item) => item.offer_id),
          proposerTexts: texts(latest.gives),
          ownerTexts: texts(latest.gets),
          cash: latest.cash,
          note: "",
        }}
        proposalId={proposal.id}
        expectedRevision={proposal.revision}
        previous={latest}
        refreshing={proposal.changed_offer_ids.length > 0}
      />
    </main>
  );
}
