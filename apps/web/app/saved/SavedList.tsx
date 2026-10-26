"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Bookmark, ImageOff, MapPin } from "lucide-react";
import { areaLabel } from "@batr/shared";
import { OfferMarks } from "@/components/offers/OfferMarks";
import { Button } from "@/components/ui";
import { ExchangeIcon } from "@/components/ui/ExchangeIcon";
import type { SavedItem } from "@/lib/offers/types";

export interface SavedListProps {
  initial: SavedItem[];
  nextCursor: string | null;
}

const browseClasses =
  "inline-flex h-12 items-center justify-center rounded-full bg-bg-surface px-6 text-body font-semibold text-bg-inverse transition hover:brightness-95";

/**
 * The member's saved offers, newest saved first, 20 at a time. Each
 * available offer keeps its heart and bookmark, so unsaving works here
 * as it does on a card. An offer that is no longer available shows only
 * that, with Remove.
 */
export function SavedList({ initial, nextCursor }: SavedListProps) {
  const [items, setItems] = useState(initial);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/me/saved?${new URLSearchParams({ cursor }).toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const { data } = (await response.json()) as {
        data: { items: SavedItem[]; next_cursor: string | null };
      };
      const seen = new Set(items.map((item) => item.offer_id));
      setItems([...items, ...data.items.filter((item) => !seen.has(item.offer_id))]);
      setCursor(data.next_cursor);
    } catch {
      setMessage("We couldn't load more saved offers. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(offerId: string) {
    setRemoving(offerId);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/offers/${offerId}/save`, {
        method: "DELETE",
        cache: "no-store",
      });
      if (!response.ok) throw new Error(String(response.status));
      setItems((current) => current.filter((item) => item.offer_id !== offerId));
      setMessage("Removed from Saved.");
    } catch {
      setMessage("That didn't work. Check your connection and try again.");
    } finally {
      setRemoving(null);
    }
  }

  if (items.length === 0) {
    return (
      <section className="relative flex flex-col items-center overflow-hidden rounded-xl bg-bg-inverse px-6 py-14 text-center text-text-on-inverse md:py-20">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 size-[32rem] rounded-full bg-[radial-gradient(closest-side,var(--color-accent-on-inverse),transparent)] opacity-[0.10]"
        />
        <span
          aria-hidden="true"
          className="relative flex size-24 items-center justify-center rounded-full border border-text-on-inverse/15"
        >
          <span className="flex size-16 items-center justify-center rounded-full border border-accent-on-inverse/40">
            <Bookmark className="size-7" />
          </span>
        </span>
        <h2 className="relative mt-6 text-h2">Nothing saved yet</h2>
        <p className="relative mt-3 max-w-sm text-body text-text-on-inverse-muted">
          Tap the bookmark on any offer to keep it here and come back to it later.
        </p>
        <Link href="/explore" className={`relative mt-7 ${browseClasses}`}>
          Browse offers
        </Link>
        <p role="status" className="sr-only">
          {message}
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Saved offers" className="flex flex-col gap-3">
        {items.map((item) => {
          const offer = item.offer;
          if (!offer) {
            return (
              <li
                key={item.offer_id}
                className="flex items-center gap-4 rounded-xl border border-dashed border-border-strong/50 bg-bg-surface p-3 pr-4"
              >
                <span className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-bg-subtle text-text-muted md:h-24 md:w-32">
                  <ImageOff aria-hidden="true" className="size-6" />
                </span>
                <p className="flex-1 text-body-sm font-semibold text-text-secondary">This offer isn&apos;t available</p>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={removing === item.offer_id}
                  onClick={() => void remove(item.offer_id)}
                >
                  Remove
                </Button>
              </li>
            );
          }
          const area = areaLabel(offer.area);
          return (
            <li key={item.offer_id} className="relative">
              <Link
                href={`/offers/${offer.id}`}
                className="group flex gap-4 rounded-xl bg-bg-surface p-3 pr-14 shadow-card ring-1 ring-border-default/70 transition hover:shadow-card-hover sm:pr-28"
              >
                <span className="relative size-20 shrink-0 overflow-hidden rounded-lg bg-bg-subtle md:h-24 md:w-32">
                  {offer.cover?.thumb_url ? (
                    <Image
                      src={offer.cover.thumb_url}
                      alt={offer.cover.alt_text}
                      fill
                      unoptimized
                      sizes="128px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full items-center justify-center text-text-muted">
                      <ImageOff aria-hidden="true" className="size-5" />
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <span className="line-clamp-2 font-display text-h4 font-medium group-hover:text-accent-primary sm:truncate sm:text-h3">{offer.title}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-caption font-normal text-text-muted">
                    <span className="truncate">{offer.owner.display_name ?? "BATR member"}</span>
                    {area ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <MapPin aria-hidden="true" className="size-3 shrink-0" />
                        <span className="truncate">{area}</span>
                      </>
                    ) : null}
                  </span>
                  <span className="mt-1 flex min-w-0 items-center gap-1.5 text-body-sm">
                    <ExchangeIcon className="size-4 shrink-0 text-accent-primary" />
                    <span className="truncate">
                      <span className="text-text-muted">In return: </span>
                      {offer.wants_text}
                    </span>
                  </span>
                </span>
              </Link>
              <OfferMarks
                offerId={offer.id}
                title={offer.title}
                liked={offer.liked}
                saved={offer.saved}
                className="absolute top-3 right-3 flex-col sm:flex-row"
              />
            </li>
          );
        })}
      </ul>
      <p role="status" className="text-body-sm text-text-secondary empty:hidden">
        {message}
      </p>
      {cursor ? (
        <Button variant="secondary" className="self-center" loading={loading} onClick={() => void loadMore()}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
