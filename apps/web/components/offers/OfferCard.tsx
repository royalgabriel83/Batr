"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ImageOff, MapPin } from "lucide-react";
import { OFFER_CATEGORIES, areaLabel } from "@batr/shared";
import { MemberInitial } from "@/components/ui/MemberInitial";
import { postedAge } from "@/lib/offers/posted-age";
import type { OfferSummary } from "@/lib/offers/types";
import { ExchangePair } from "./ExchangePair";
import { OfferMarks } from "./OfferMarks";

export interface OfferCardProps {
  offer: OfferSummary;
  /** Signed out: the heart and bookmark lead to sign-in. */
  guest?: boolean;
  /** The first card on a page: its photo is likely the largest paint, so it loads first. */
  priority?: boolean;
}

/**
 * A marketplace card in the approved reference style (owner,
 * 2026-10-17): a white card with an inset photo, the category on the
 * photo and the heart and bookmark at its top right; then a serif
 * title, what is offered, the owner and general area, and what they
 * want in return. Every card has the same shape whatever the text
 * length. The card is one link to the offer page; the heart and
 * bookmark sit beside it, over the photo, so no control is nested in
 * the link. A photo that fails to load shows a neutral placeholder.
 */
export function OfferCard({ offer, guest = false, priority = false }: OfferCardProps) {
  const [broken, setBroken] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const src = offer.cover?.thumb_url ?? null;
  // A photo that failed before the page became interactive fired its error before React listened.
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth === 0) setBroken(true);
  }, []);
  const age = postedAge(offer.published_at);
  const area = areaLabel(offer.area);
  return (
    <div className="group relative h-full">
      <Link
        href={`/offers/${offer.id}`}
        className="flex h-full flex-col rounded-xl bg-bg-surface p-2 shadow-card ring-1 ring-border-default/70 transition duration-base ease-standard hover:-translate-y-0.5 hover:shadow-card-hover active:translate-y-0 active:scale-[0.99]"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-bg-subtle">
          {src && !broken ? (
            <Image
              ref={image}
              src={src}
              alt={offer.cover?.alt_text ?? ""}
              fill
              unoptimized
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition duration-slow ease-standard group-hover:scale-[1.03]"
              onError={() => setBroken(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-text-muted">
              <ImageOff aria-hidden="true" className="size-6" />
            </div>
          )}
          {offer.category || offer.offer_type === "service" ? (
            <span className="absolute bottom-2.5 left-2.5 rounded-full bg-bg-surface/95 px-2.5 py-1 text-caption text-text-primary shadow-sm">
              {/* Services are marked, so Both reads clearly (milestone 9, V5). */}
              {[offer.offer_type === "service" ? "Service" : null, offer.category ? OFFER_CATEGORIES[offer.category] : null].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col px-2 pt-3.5 pb-2">
          <h2 className="line-clamp-2 font-display sm:min-h-14 text-h3 font-medium tracking-tight break-words group-hover:text-accent-primary">
            {offer.title}
          </h2>
          <p className="mt-1 truncate text-body-sm text-text-secondary">{offer.offering_text}</p>
          <div className="mt-3 mb-3.5 flex items-start gap-2">
            {/* Room for the area line on every card, so the cards in a row line up. */}
            <div className="flex min-w-0 flex-1 flex-col sm:min-h-10">
              <p className="flex min-w-0 items-center gap-2 text-caption font-semibold text-text-primary">
                <MemberInitial name={offer.owner.display_name} size="md" />
                <span className="truncate">{offer.owner.display_name ?? "BATR member"}</span>
              </p>
              {area ? (
                <span className="-mt-0.5 flex min-w-0 items-center gap-1 pl-8 text-caption font-normal text-text-muted">
                  <MapPin aria-hidden="true" className="size-3 shrink-0" />
                  <span className="truncate">{area}</span>
                </span>
              ) : null}
            </div>
            {age ? (
              <time
                dateTime={offer.published_at ?? undefined}
                className="mt-1 shrink-0 text-caption font-normal text-text-muted"
                suppressHydrationWarning
              >
                {age}
              </time>
            ) : null}
          </div>
          <ExchangePair variant="return" offering={offer.offering_text} wants={offer.wants_text} className="mt-auto" />
        </div>
      </Link>
      <OfferMarks
        offerId={offer.id}
        title={offer.title}
        liked={offer.liked}
        saved={offer.saved}
        guest={guest}
        className="absolute top-4 right-4"
      />
    </div>
  );
}
