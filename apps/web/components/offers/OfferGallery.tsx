"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ImageOff } from "lucide-react";
import { Carousel } from "@/components/ui/Carousel";
import { cx } from "@/components/ui/cx";

export interface GalleryPhoto {
  /** The photo id when the gallery can refresh links (`offerId` given). */
  key: string;
  src: string | null;
  alt: string;
}

export interface OfferGalleryProps {
  photos: GalleryPhoto[];
  title: string;
  /**
   * On the offer page: refresh expired signed links from
   * /api/v1/offers/:id/photo-urls once when an image fails to load, and
   * when a page open for more than 8 minutes regains focus
   * (milestone-1.md, Storage and access). Left out in the editor preview.
   */
  offerId?: string;
  /** Controls over the main photo's top right (the heart and bookmark). */
  overlay?: ReactNode;
}

/** Links last 10 minutes; a page open longer than this refreshes them on focus. */
const REFRESH_AFTER_MS = 8 * 60 * 1000;

type Refresh = "idle" | "loading" | "done" | "unavailable";

/**
 * The offer's photos as a carousel that moves on its own, with dots
 * over the photo (owner, 2026-10-20), and selectable thumbnails in a
 * column on the left from lg (the approved reference). Photos without
 * a link show a placeholder.
 */
export function OfferGallery({ photos: given, title, offerId, overlay }: OfferGalleryProps) {
  const [selected, setSelected] = useState(0);
  /** Links that failed to load (a fresh link for the same photo is tried again). */
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  /** Fresh links by photo id, after a refresh; photos missing from it were removed. */
  const [fresh, setFresh] = useState<Map<string, string | null> | null>(null);
  const [refresh, setRefresh] = useState<Refresh>("idle");
  const loadedAt = useRef(0);
  const frame = useRef<HTMLDivElement>(null);

  const photos = fresh ? given.filter((p) => fresh.has(p.key)).map((p) => ({ ...p, src: fresh.get(p.key) ?? null })) : given;

  const refreshLinks = useCallback(async () => {
    if (!offerId) return;
    setRefresh("loading");
    try {
      const response = await fetch(`/api/v1/offers/${offerId}/photo-urls`, { cache: "no-store" });
      if (response.status === 404) {
        setRefresh("unavailable");
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const { data } = (await response.json()) as { data: { id: string; url: string | null }[] };
      setFresh(new Map(data.map((p) => [p.id, p.url])));
      // Try every photo again, even one whose fresh link reads the same.
      setFailed(new Set());
      loadedAt.current = Date.now();
      setRefresh("done");
    } catch {
      // Keep what is shown; the placeholder covers photos that still fail.
      setRefresh("done");
    }
  }, [offerId]);

  useEffect(() => {
    if (!offerId) return;
    const onFocus = () => {
      if (document.visibilityState === "visible" && Date.now() - loadedAt.current > REFRESH_AFTER_MS) void refreshLinks();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [offerId, refreshLinks]);

  // A link that failed before the page became interactive fired its
  // error event before React was listening: catch it here once.
  useEffect(() => {
    loadedAt.current = Date.now();
    const broken = [...(frame.current?.querySelectorAll("img") ?? [])].filter((img) => img.complete && img.naturalWidth === 0);
    if (broken.length > 0) onImageError(broken[0]?.getAttribute("src") ?? "");
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onImageError(src: string) {
    setFailed((current) => new Set(current).add(src));
    // Once per page view; after that the placeholder stays.
    if (offerId && refresh === "idle") void refreshLinks();
  }

  if (refresh === "unavailable") {
    return (
      <div role="alert" className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-xl border border-border-default bg-bg-subtle p-6 text-center">
        <ImageOff aria-hidden="true" className="size-8 text-text-muted" />
        <p className="text-body font-semibold">This offer isn&apos;t available</p>
        <Link href="/explore" className="inline-flex h-11 items-center text-body-sm font-semibold text-accent-primary underline">
          Back to Explore
        </Link>
      </div>
    );
  }

  const showable = (photo: GalleryPhoto | undefined) => Boolean(photo?.src) && !failed.has(photo?.src ?? "");
  const placeholder = (text: string) => (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-body-sm text-text-muted">
      <ImageOff aria-hidden="true" className="size-8" />
      {text}
    </div>
  );
  return (
    <div ref={frame} className="flex min-w-0 flex-col gap-3 lg:flex-row-reverse lg:items-start">
      <div className="relative aspect-square w-full min-w-0 overflow-hidden rounded-xl bg-bg-subtle shadow-card lg:aspect-[5/4]">
        {photos.length === 0 ? (
          placeholder("No photos yet")
        ) : (
          <Carousel
            label={`Photos of ${title}`}
            slideLabel="Photo"
            tone="inverse"
            controls="overlay"
            index={selected}
            onChange={setSelected}
            className="h-full"
            slideClassName="h-full!"
            slides={photos.map((photo, index) => (
              <div key={photo.key} className="relative size-full">
                {showable(photo) ? (
                  <Image
                    src={photo.src as string}
                    alt={photo.alt || title}
                    fill
                    unoptimized
                    loading={index === 0 ? "eager" : "lazy"}
                    fetchPriority={index === 0 ? "high" : "auto"}
                    sizes="(min-width: 1024px) 50vw, 100vw"
                    className="object-cover"
                    onError={() => onImageError(photo.src as string)}
                  />
                ) : (
                  placeholder("Photo not available")
                )}
              </div>
            ))}
          />
        )}
        {overlay ? <div className="absolute top-3 right-3 z-20 md:top-4 md:right-4">{overlay}</div> : null}
      </div>
      {photos.length > 1 ? (
        // Thumbnails beside the photo on wide screens; phones swipe and use the dots.
        <ul className="hidden lg:flex lg:w-16 lg:shrink-0 lg:flex-col lg:gap-2" aria-label="Photos">
          {photos.map((photo, index) => (
            <li key={photo.key}>
              <button
                type="button"
                onClick={() => setSelected(index)}
                aria-label={`Show photo ${String(index + 1)} of ${String(photos.length)}`}
                aria-pressed={index === selected}
                className={cx(
                  "relative block aspect-square w-full overflow-hidden rounded-lg bg-bg-subtle ring-offset-2 ring-offset-bg-base transition duration-fast ease-standard",
                  index === selected ? "ring-2 ring-accent-primary" : "opacity-80 ring-1 ring-border-default hover:opacity-100",
                )}
              >
                {showable(photo) ? (
                  <Image src={photo.src as string} alt="" fill unoptimized sizes="96px" className="object-cover" onError={() => onImageError(photo.src as string)} />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
