import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Bookmark, Camera, PackageOpen, Plus } from "lucide-react";
import { OFFER_CATEGORIES, OFFER_CATEGORY_IDS, PRODUCT_NAME, areaLabel } from "@batr/shared";
import { OfferCard } from "@/components/offers/OfferCard";
import { OFFER_GRID_CLASSES } from "@/components/offers/grid";
import { Carousel, EmptyState, ExchangeIcon, MemberInitial } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import type { OfferSummary } from "@/lib/offers/types";
import { getCurrentMember } from "@/server/auth";
import { loadMarketplace } from "@/server/offers/queries";

// Copy follows context/project-overview.md (Overview) and says only
// what Milestone 1 does: offers and the marketplace. Proposals and
// agreements are not built, so they are named as coming next and never
// as something a member can do (owner, 2026-10-17). Layout follows the
// approved reference (owner, 2026-10-17): a dark green hero panel with
// a serif headline beside a real offer's photo, then the newest offers
// as white cards. The hero uses real offers only, never stock photos;
// with none it shows the exchange mark.
const steps = [
  {
    icon: Camera,
    title: "Make an offer",
    text: "Add photos, describe what you have and say what you'd like in return.",
  },
  {
    icon: Bookmark,
    title: "Get seen",
    text: "Your offer appears in Explore, newest first. Members can save it, and you can share its link.",
  },
  {
    icon: ExchangeIcon,
    title: "Exchanges come next",
    text: "Proposing and agreeing an exchange inside BATR isn't available yet.",
  },
] as const;

const NEWEST_COUNT = 8;
const SHOWCASE_COUNT = 5;

// Buttons on the dark frame (ui-context.md, Buttons): primary is ink on
// --accent-on-inverse; secondary is outlined. Both keep a 44px tap height.
const primaryClasses =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-accent-on-inverse px-4 sm:px-6 text-body-sm whitespace-nowrap sm:text-body font-semibold text-bg-inverse transition hover:brightness-110";
const secondaryClasses =
  "inline-flex h-12 items-center justify-center rounded-full border border-text-on-inverse-muted/50 px-4 sm:px-6 text-body-sm whitespace-nowrap sm:text-body font-semibold text-text-on-inverse transition hover:border-text-on-inverse hover:bg-text-on-inverse/10";
const actionClasses =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent-primary px-5 text-body-sm font-semibold text-text-on-accent hover:bg-accent-primary-hover";
const heroChipClasses =
  "inline-flex h-11 shrink-0 items-center rounded-full border border-text-on-inverse/15 bg-text-on-inverse/[0.06] px-4 text-body-sm font-medium whitespace-nowrap text-text-on-inverse transition-colors hover:border-accent-on-inverse/60 hover:bg-text-on-inverse/10";

/** The quiet glow and rings behind the hero, drawn with tokens only. */
function HeroLight({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute size-[40rem] rounded-full bg-[radial-gradient(closest-side,var(--color-accent-on-inverse),transparent)] opacity-[0.10]",
        className,
      )}
    />
  );
}

/**
 * The hero's showcase: up to five real offers, shown as their exchange,
 * in a carousel that moves on its own (owner, 2026-10-20). The photo is
 * what the member is offering; the white card over it is what they
 * want in return. Without a photographed offer, the exchange mark
 * stands in on wide screens. On phones it closes the hero panel.
 */
function HeroShowcase({ offers }: { offers: OfferSummary[] }) {
  const shown = offers.filter((candidate) => candidate.cover?.thumb_url).slice(0, SHOWCASE_COUNT);
  if (shown.length === 0) {
    return (
      <div aria-hidden="true" className="relative hidden items-center justify-center lg:flex">
        <span className="absolute size-80 rounded-full border border-text-on-inverse/10" />
        <span className="absolute size-56 rounded-full border border-text-on-inverse/15" />
        <span className="flex size-28 items-center justify-center rounded-full bg-accent-on-inverse text-bg-inverse">
          <ExchangeIcon className="size-12" />
        </span>
      </div>
    );
  }
  return (
    <div className="relative mx-5 mb-5 aspect-[4/3] overflow-hidden rounded-lg md:mx-10 md:mb-10 md:aspect-[16/9] lg:m-0 lg:aspect-auto lg:rounded-none">
      <Carousel
        label="Recently posted"
        slideLabel="Offer"
        tone="inverse"
        controls="overlay"
        className="h-full"
        slideClassName="h-full!"
        slides={shown.map((offer, index) => (
          <HeroSlide key={offer.id} offer={offer} first={index === 0} />
        ))}
      />
      {/* Blends the photos into the panel on their left edge. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 z-10 hidden w-24 bg-linear-to-r from-bg-inverse to-transparent lg:block" />
    </div>
  );
}

function HeroSlide({ offer, first }: { offer: OfferSummary; first: boolean }) {
  const area = areaLabel(offer.area);
  const cover = offer.cover;
  if (!cover?.thumb_url) return null;
  return (
    <Link href={`/offers/${offer.id}`} className="group relative block size-full overflow-hidden">
      <Image
        src={cover.thumb_url}
        alt={cover.alt_text}
        fill
        unoptimized
        loading={first ? "eager" : "lazy"}
        fetchPriority={first ? "high" : "auto"}
        sizes="(min-width: 1024px) 640px, 100vw"
        className="object-cover transition duration-700 ease-standard group-hover:scale-[1.02]"
      />
      {/* The card rises into place as its slide arrives (hidden slides are inert). */}
      <span className="absolute inset-x-3 bottom-12 flex flex-col rounded-xl bg-bg-surface p-3 text-text-primary shadow-lg transition duration-slow ease-emphasized sm:inset-x-auto sm:left-4 sm:w-72 sm:p-4 lg:bottom-14 lg:left-6 [[inert]_&]:translate-y-3 [[inert]_&]:opacity-0">
        <span className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-primary text-text-on-accent">
            <ExchangeIcon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-body-sm font-semibold">{offer.offering_text}</span>
            <span className="truncate text-caption font-normal text-text-secondary">
              <span className="text-accent-primary">In return:</span> {offer.wants_text}
            </span>
          </span>
        </span>
        <span className="mt-3 flex items-center gap-2 border-t border-border-default pt-3 text-caption text-text-secondary max-sm:hidden">
          <MemberInitial name={offer.owner.display_name} />
          <span className="truncate">{offer.owner.display_name ?? "BATR member"}</span>
          {area ? <span className="ml-auto shrink-0 font-normal text-text-muted">{area}</span> : null}
        </span>
      </span>
    </Link>
  );
}

/**
 * "How BATR works" as a carousel with dotted pagination (owner,
 * 2026-10-20): one step per slide, each beside a picture drawn from
 * real offers. Pictures are decorative; the step text carries the
 * meaning. Without offers each step shows its icon.
 */
function HowItWorks({ offers }: { offers: OfferSummary[] }) {
  const photographed = offers.filter((offer) => offer.cover?.thumb_url);
  return (
    <section
      aria-labelledby="how-heading"
      className="reveal mb-12 rounded-xl bg-bg-surface px-5 pt-10 pb-4 shadow-card ring-1 ring-border-default/70 md:mb-20 md:px-10 md:pt-14 md:pb-6"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="how-heading" className="text-h2 md:text-h2-lg">
          How {PRODUCT_NAME} works
        </h2>
        <span className="rounded-full border border-border-default px-2.5 py-0.5 text-caption text-text-muted">
          Early version
        </span>
      </div>
      <Carousel
        label="Steps"
        slideLabel="Step"
        className="mt-6 md:mt-8"
        slides={steps.map(({ icon: Icon, title, text }, index) => {
          const next = index === steps.length - 1;
          return (
            <div key={title} className="grid grid-cols-1 items-center gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-10">
              <StepPicture step={index} offers={photographed} icon={<Icon className="size-8" />} />
              <div className="flex flex-col gap-2 transition duration-slow ease-emphasized [[inert]_&]:translate-y-2 [[inert]_&]:opacity-0">
                <p className={cx("text-body-sm font-semibold", next ? "text-text-muted" : "text-accent-primary")}>
                  Step {index + 1} of {steps.length}
                </p>
                <h3 className={cx("text-h3 tracking-tight md:text-h2", next && "text-text-secondary")}>{title}</h3>
                <p className="max-w-md text-body text-text-secondary">{text}</p>
              </div>
            </div>
          );
        })}
      />
    </section>
  );
}

const pictureFrame = "relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-lg bg-bg-subtle";

/** The picture beside a step, built from real offers; decorative. */
function StepPicture({ step, offers, icon }: { step: number; offers: OfferSummary[]; icon: ReactNode }) {
  const lead = offers[0];
  if (!lead?.cover?.thumb_url) {
    return (
      <div aria-hidden="true" className={pictureFrame}>
        <span className="flex size-20 items-center justify-center rounded-full bg-accent-soft text-accent-primary">{icon}</span>
      </div>
    );
  }
  if (step === 0) {
    // A cover photo with the two sides written underneath, as when making an offer.
    return (
      <div aria-hidden="true" className={pictureFrame}>
        <div className="flex w-3/5 max-w-64 flex-col rounded-xl bg-bg-surface p-2 shadow-card">
          <span className="relative aspect-[4/3] overflow-hidden rounded-lg">
            <Image src={lead.cover.thumb_url} alt="" fill unoptimized sizes="16rem" className="object-cover" />
            <span className="absolute top-2 left-2 flex size-7 items-center justify-center rounded-full bg-bg-surface/95 text-accent-primary">
              <Camera className="size-3.5" />
            </span>
          </span>
          <span className="mt-2 truncate px-1 text-caption font-semibold">{lead.offering_text}</span>
          <span className="truncate px-1 pb-1 text-caption text-text-secondary">
            <span className="text-accent-primary">In return:</span> {lead.wants_text}
          </span>
        </div>
      </div>
    );
  }
  if (step === 1) {
    // Offers side by side, newest first, one of them saved.
    return (
      <div aria-hidden="true" className={cx(pictureFrame, "gap-2 px-4")}>
        {offers.slice(0, 3).map((offer, index) => (
          <span key={offer.id} className={cx("relative aspect-[3/4] flex-1 overflow-hidden rounded-lg bg-bg-surface shadow-card", index === 1 && "-translate-y-2")}>
            {offer.cover?.thumb_url ? <Image src={offer.cover.thumb_url} alt="" fill unoptimized sizes="10rem" className="object-cover" /> : null}
            {index === 0 ? (
              <span className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-bg-surface/95 text-accent-primary">
                <Bookmark className="size-3.5 fill-current" />
              </span>
            ) : null}
          </span>
        ))}
      </div>
    );
  }
  // The two sides of an exchange, waiting to meet: proposals aren't built yet.
  return (
    <div aria-hidden="true" className={cx(pictureFrame, "gap-2 px-4 sm:gap-3")}>
      <span className="flex w-2/5 min-w-0 flex-col gap-0.5 rounded-lg bg-bg-surface p-3 shadow-card">
        <span className="text-caption text-text-muted">Offering</span>
        <span className="line-clamp-2 text-body-sm font-medium">{lead.offering_text}</span>
      </span>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-text-muted">
        <ExchangeIcon className="size-5" />
      </span>
      <span className="flex w-2/5 min-w-0 flex-col gap-0.5 rounded-lg border border-dashed border-border-strong/70 p-3">
        <span className="text-caption text-text-muted">Their offer</span>
        <span className="text-body-sm text-text-muted">Coming next</span>
      </span>
    </div>
  );
}

export default async function HomePage() {
  const member = await getCurrentMember();
  let newest: OfferSummary[] | null = null;
  try {
    newest = (await loadMarketplace(member?.id ?? null, null)).offers.slice(0, NEWEST_COUNT);
  } catch (error) {
    console.error("Newest offers could not be loaded", error);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
      <section
        aria-labelledby="hero-heading"
        className="relative mt-3 grid grid-cols-1 overflow-hidden rounded-xl bg-bg-inverse text-text-on-inverse md:mt-6 lg:min-h-[30rem] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
      >
        <HeroLight className="-top-64 -left-48" />
        <div className="relative flex min-w-0 flex-col px-5 pt-8 pb-7 md:px-10 md:pt-12 md:pb-10 lg:px-14 lg:py-14">
          <p className="text-body-sm font-semibold text-accent-on-inverse">Peer-to-peer exchange</p>
          <h1 id="hero-heading" className="mt-3 max-w-xl text-display text-balance md:mt-4 md:text-display-lg">
            Exchange what you have for <span className="text-accent-on-inverse">what you need.</span>
          </h1>
          <p className="mt-4 max-w-lg text-body text-text-on-inverse-muted md:mt-5">
            {PRODUCT_NAME} is a peer-to-peer exchange marketplace. Post something you can give, say what you&apos;d like in
            return, and see what other members are offering.
          </p>
          <div className="mt-6 flex gap-3 md:mt-8">
            <Link href="/explore" className={cx(primaryClasses, "max-sm:flex-1")}>
              Explore offers
              <ArrowRight aria-hidden="true" className="size-4 max-sm:hidden" />
            </Link>
            {/* Not prefetched: signed out, it only redirects to sign-in. */}
            <Link href="/offers/new" prefetch={false} className={cx(secondaryClasses, "max-sm:flex-1")}>
              Create an offer
            </Link>
          </div>
          <nav aria-label="Categories" className="-mx-5 mt-7 overflow-x-auto px-5 md:mx-0 md:mt-auto md:px-0 md:pt-10">
            <ul className="flex gap-2 pb-1 md:flex-wrap">
              {OFFER_CATEGORY_IDS.map((id) => (
                <li key={id}>
                  <Link href={`/explore?category=${id}`} className={heroChipClasses}>
                    {OFFER_CATEGORIES[id]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        {newest ? <HeroShowcase offers={newest} /> : null}
      </section>

      <section aria-labelledby="newest-heading" className="pt-10 pb-12 md:pt-16 md:pb-20">
        <div className="flex items-end justify-between gap-4">
          <h2 id="newest-heading" className="text-h2 md:text-h2-lg">
            Newest offers
          </h2>
          <Link
            href="/explore"
            className="group inline-flex h-11 items-center gap-1.5 text-body-sm font-semibold text-accent-primary"
          >
            View all
            <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
        {newest === null ? (
          <p role="alert" className="mt-6 text-body text-text-secondary">
            We couldn&apos;t load the newest offers.{" "}
            <Link href="/explore" className="font-semibold text-accent-primary underline">
              Open Explore
            </Link>
          </p>
        ) : newest.length === 0 ? (
          <EmptyState
            as="h3"
            className="mt-6"
            icon={<PackageOpen aria-hidden="true" />}
            title="No offers yet"
            action={
              <Link href="/offers/new" prefetch={false} className={actionClasses}>
                <Plus aria-hidden="true" className="size-4" />
                Create an offer
              </Link>
            }
          >
            Be the first: say what you have and what you&apos;d like in return.
          </EmptyState>
        ) : (
          <ul aria-label="Newest offers" className={cx(OFFER_GRID_CLASSES, "mt-5 md:mt-8 max-sm:[&>li:nth-child(n+5)]:hidden")}>
            {newest.map((offer) => (
              <li key={offer.id} className="reveal">
                <OfferCard offer={offer} guest={!member} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <HowItWorks offers={newest ?? []} />
    </main>
  );
}
