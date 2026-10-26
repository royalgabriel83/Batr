"use client";

import { useEffect, useRef, useState } from "react";
import type { OfferCategory, OfferType } from "@batr/shared";
import { OfferCard } from "@/components/offers/OfferCard";
import { Button } from "@/components/ui";
import type { OfferSummary } from "@/lib/offers/types";
import { OFFER_GRID_CLASSES } from "@/components/offers/grid";

export interface MarketplaceListProps {
  initial: OfferSummary[];
  nextCursor: string | null;
  category: OfferCategory | null;
  /** Items or services only; null for both (milestone 9, V5). */
  type?: OfferType | null;
  /** Signed out: the heart and bookmark lead to sign-in. */
  guest: boolean;
}

/**
 * The marketplace grid with "Load more" (20 per page, newest first).
 * Later pages come from the same API the page was rendered from;
 * entries already shown are never repeated. After loading, focus moves
 * to the first new offer and the count is announced.
 */
export function MarketplaceList({ initial, nextCursor, category, type = null, guest }: MarketplaceListProps) {
  const [offers, setOffers] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const list = useRef<HTMLUListElement>(null);
  /** The first newly loaded card, focused once it is on screen. */
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex === null) return;
    list.current?.querySelectorAll<HTMLAnchorElement>(":scope > li a")[focusIndex]?.focus();
  }, [focusIndex]);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ cursor });
      if (category) params.set("category", category);
      if (type) params.set("type", type);
      const response = await fetch(`/api/v1/offers?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const { data } = (await response.json()) as { data: { offers: OfferSummary[]; next_cursor: string | null } };
      const seen = new Set(offers.map((o) => o.id));
      const added = data.offers.filter((o) => !seen.has(o.id));
      const firstNew = offers.length;
      setOffers([...offers, ...added]);
      setCursor(data.next_cursor);
      setAnnouncement(`${String(added.length)} more ${added.length === 1 ? "offer" : "offers"} shown.`);
      if (added.length > 0) setFocusIndex(firstNew);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ul ref={list} className={OFFER_GRID_CLASSES} aria-label="Offers">
        {offers.map((offer, index) => (
          <li key={offer.id} className="reveal">
            <OfferCard offer={offer} guest={guest} priority={index === 0} />
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {failed ? (
        <p role="alert" className="text-body-sm text-text-secondary">
          We couldn&apos;t load more offers. Check your connection and try again.
        </p>
      ) : null}
      {cursor ? (
        <Button variant="secondary" className="self-center" loading={loading} onClick={() => void loadMore()}>
          {failed ? "Retry" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
