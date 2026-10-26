import { OFFER_GRID_CLASSES } from "@/components/offers/grid";

// Skeleton cards while the marketplace loads (01-marketplace-discovery.md,
// Loading state; ui-context.md: skeletons, not spinners). Same shape as
// OfferCard so nothing jumps when the offers arrive.
const bar = "animate-pulse rounded bg-bg-subtle motion-reduce:animate-none";

export default function ExploreLoading() {
  return (
    <main aria-busy="true" className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6 md:py-12 lg:px-8">
      <span className="sr-only" role="status">
        Loading offers
      </span>
      <div className={`h-10 w-40 ${bar}`} />
      <ul className={OFFER_GRID_CLASSES} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="flex flex-col overflow-hidden rounded-lg border border-border-default bg-bg-surface">
            <div className={`aspect-[16/10] sm:aspect-[4/3] ${bar} rounded-none`} />
            <div className="flex flex-col gap-3 p-4">
              <div className={`h-4 w-3/4 ${bar}`} />
              <div className={`h-3 w-full ${bar}`} />
              <div className={`h-3 w-2/3 ${bar}`} />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
