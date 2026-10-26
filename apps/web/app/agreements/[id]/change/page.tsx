import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PRODUCT_NAME } from "@batr/shared";
import {
  ProposalComposer,
  type OfferOption,
} from "@/components/proposals/ProposalComposer";
import { nameOr, otherRole, type ItemView } from "@/lib/proposals/terms";
import type { VersionView } from "@/server/api/agreements";
import { requireMember } from "@/server/auth";
import { loadAgreement } from "@/server/proposals/queries";

export const metadata: Metadata = { title: `Propose a change · ${PRODUCT_NAME}` };

// Propose a change: the composer prefilled with the agreed terms
// (specs/milestone-4.md, user journey 4). Either member, before any
// handover (D4).

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

export default async function ChangePage({
  params,
}: PageProps<"/agreements/[id]/change">) {
  const { id } = await params;
  await requireMember(`/agreements/${id}/change`);
  const agreement = await loadAgreement(id);
  if (!agreement) notFound();
  if (!agreement.actions.propose_change) redirect(`/agreements/${agreement.id}`);
  const binding = agreement.versions.find(
    (v) => v.id === agreement.binding_version_id,
  ) as VersionView;
  const other = nameOr(agreement[otherRole(agreement.viewer_role)].display_name);
  const target = offers(binding.gets)[0];
  if (!target) notFound();
  // The proposer's active offers, plus any offer already agreed.
  const choices = [...agreement.gives_choices];
  for (const item of offers(binding.gives))
    if (!choices.some((offer) => offer.id === item.offer_id))
      choices.push(asOption(item));
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6 md:py-10">
      <Link
        href={`/agreements/${agreement.id}`}
        className="inline-flex h-11 items-center gap-1 self-start text-body-sm font-semibold text-accent-primary"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to the agreement
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 md:text-h2-lg">Propose a change</h1>
        <p className="text-body text-text-secondary">
          Start from the terms you agreed with {other}. Change an item or the
          cash, then check the terms before you send them. The agreed terms
          stay in place until {other} accepts.
        </p>
      </div>
      <ProposalComposer
        mode="change"
        viewerRole={agreement.viewer_role}
        otherName={other}
        target={asOption(target)}
        choices={choices}
        start={{
          proposerOffers: offers(binding.gives).map((item) => item.offer_id),
          proposerTexts: texts(binding.gives),
          ownerTexts: texts(binding.gets),
          cash: binding.cash,
          note: "",
        }}
        agreementId={agreement.id}
        expectedVersion={binding.number}
        previous={binding}
      />
    </main>
  );
}
