import type { Metadata } from "next";
import Link from "next/link";
import { PackageOpen, Plus, RotateCw, SearchX } from "lucide-react";
import { OFFER_CATEGORIES, OFFER_CATEGORY_IDS, OFFER_TYPE_IDS, PRODUCT_NAME, categoryType, type OfferCategory, type OfferType } from "@batr/shared";
import { OfferCard } from "@/components/offers/OfferCard";
import { OFFER_GRID_CLASSES } from "@/components/offers/grid";
import { EmptyState } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import type { OfferSummary } from "@/lib/offers/types";
import { getCurrentMember } from "@/server/auth";
import { loadMarketplace } from "@/server/offers/queries";
import { MarketplaceList } from "./MarketplaceList";

// The marketplace (01-marketplace-discovery.md; milestone-1.md, unit 08):
// active offers, newest first, 20 per page, with a category filter and
// an Items / Services / Both filter (milestone-9-services.md, V5).
// Open to signed-out visitors (D6). Rendered per request with the
// viewer's own session; never cached (the cards carry signed links).
// Keyword search, condition filter and quick view are not in Milestone 1.

export const metadata: Metadata = { title: `Explore · ${PRODUCT_NAME}` };

const chipClasses =
  "inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-body-sm font-medium whitespace-nowrap transition-colors";
const actionClasses =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-accent-primary px-4 text-body-sm font-semibold text-text-on-accent hover:bg-accent-primary-hover";

const SUGGESTED_COUNT = 4;

function categoryFrom(value: string | string[] | undefined): OfferCategory | null {
  return typeof value === "string" && OFFER_CATEGORY_IDS.includes(value as OfferCategory) ? (value as OfferCategory) : null;
}

function typeFrom(value: string | string[] | undefined): OfferType | null {
  return typeof value === "string" && OFFER_TYPE_IDS.includes(value as OfferType) ? (value as OfferType) : null;
}

const TYPE_FILTERS: { id: OfferType | null; label: string }[] = [
  { id: "item", label: "Items" },
  { id: "service", label: "Services" },
  { id: null, label: "Both" },
];

/** An Explore link; a category of the other type is dropped. */
function exploreHref(category: OfferCategory | null, type: OfferType | null) {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (category && (!type || categoryType(category) === type)) params.set("category", category);
  const query = params.toString();
  return query ? `/explore?${query}` : "/explore";
}

export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const params = await searchParams;
  const type = typeFrom(params.type);
  const chosen = categoryFrom(params.category);
  const category = chosen && (!type || categoryType(chosen) === type) ? chosen : null;
  const member = await getCurrentMember();
  let page: Awaited<ReturnType<typeof loadMarketplace>> | null = null;
  try {
    page = await loadMarketplace(member?.id ?? null, category, null, type);
  } catch (error) {
    console.error("Marketplace could not be loaded", error);
  }
  const here = exploreHref(category, type);
  // An empty category suggests the newest offers from every category instead of a dead end.
  let elsewhere: OfferSummary[] = [];
  if (category && page?.offers.length === 0) {
    try {
      elsewhere = (await loadMarketplace(member?.id ?? null, null, null, type)).offers.slice(0, SUGGESTED_COUNT);
    } catch (error) {
      console.error("Suggested offers could not be loaded", error);
    }
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-8 pb-12 md:gap-8 md:px-6 md:pt-12 md:pb-16 lg:px-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 md:text-h2-lg">Explore offers</h1>
        <p className="text-body text-text-secondary">What members have, and what they&apos;d like in return. Newest first.</p>
      </div>

      <nav aria-label="Items or services">
        <ul className="inline-flex rounded-full border border-border-default bg-bg-surface p-1">
          {TYPE_FILTERS.map((filter) => {
            const current = filter.id === type;
            return (
              <li key={filter.label}>
                <Link
                  href={exploreHref(category, filter.id)}
                  aria-current={current ? "page" : undefined}
                  className={cx(
                    "inline-flex h-9 items-center rounded-full px-4 text-body-sm font-medium",
                    current ? "bg-accent-primary text-text-on-accent" : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {filter.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Categories" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex gap-2 pb-1 md:flex-wrap">
          {[null, ...OFFER_CATEGORY_IDS.filter((id) => !type || categoryType(id) === type)].map((id) => {
            const current = id === category;
            return (
              <li key={id ?? "all"}>
                <Link
                  href={exploreHref(id, type)}
                  aria-current={current ? "page" : undefined}
                  className={cx(
                    chipClasses,
                    current
                      ? "border-accent-primary bg-accent-primary text-text-on-accent"
                      : "border-border-default bg-bg-surface text-text-secondary hover:border-accent-primary/40 hover:text-text-primary",
                  )}
                >
                  {id ? OFFER_CATEGORIES[id] : "All"}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {page === null ? (
        <EmptyState
          role="alert"
          icon={<RotateCw aria-hidden="true" />}
          title="We couldn't load offers"
          action={
            <a href={here} className={actionClasses}>
              Retry
            </a>
          }
        >
          Check your connection and try again.
        </EmptyState>
      ) : page.offers.length === 0 ? (
        category ? (
          <>
            <EmptyState
              icon={<SearchX aria-hidden="true" />}
              title={`No offers in ${OFFER_CATEGORIES[category]} yet`}
              action={
                <Link href="/offers/new" className={actionClasses}>
                  <Plus aria-hidden="true" className="size-4" />
                  Offer something in {OFFER_CATEGORIES[category]}
                </Link>
              }
            >
              Be the first to offer something here, or see what members are offering elsewhere.
            </EmptyState>
            {elsewhere.length > 0 ? (
              <section aria-labelledby="elsewhere-heading" className="flex flex-col gap-5">
                <div className="flex items-end justify-between gap-4">
                  <h2 id="elsewhere-heading" className="text-h3">
                    Newest in other categories
                  </h2>
                  <Link href={exploreHref(null, type)} className="inline-flex h-11 items-center text-body-sm font-semibold text-accent-primary">
                    See every offer
                  </Link>
                </div>
                <ul className={OFFER_GRID_CLASSES}>
                  {elsewhere.map((offer) => (
                    <li key={offer.id}>
                      <OfferCard offer={offer} guest={!member} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon={<PackageOpen aria-hidden="true" />}
            title={type === "service" ? "No services yet" : type === "item" ? "No items yet" : "No offers yet"}
            action={
              <Link href="/offers/new" className={actionClasses}>
                <Plus aria-hidden="true" className="size-4" />
                Create an offer
              </Link>
            }
          >
            Be the first: say what you have and what you&apos;d like in return.
          </EmptyState>
        )
      ) : (
        <MarketplaceList key={here} initial={page.offers} nextCursor={page.next_cursor} category={category} type={type} guest={!member} />
      )}
    </main>
  );
}
