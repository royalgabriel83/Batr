"use client";

import "swiper/css";
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper";
import { useReducedMotion } from "motion/react";
import { Pause, Play } from "lucide-react";
import { motion as motionTokens } from "@batr/shared";
import { cx } from "./cx";

export type CarouselTone = "light" | "inverse";

export interface CarouselProps {
  /** Names the carousel for screen readers, such as "Recently posted". */
  label: string;
  slides: ReactNode[];
  /** Read as "{slideLabel} 2 of 3" on each slide and dot; defaults to "Slide". */
  slideLabel?: string;
  /** Moves on its own every `motion.carouselIntervalMs`; on by default. */
  autoplay?: boolean;
  /**
   * `inverse` draws the controls light, for photos and the dark frame;
   * `light` draws them in ink and green on light surfaces.
   */
  tone?: CarouselTone;
  /** `overlay` sits the controls over the bottom of the slides; `below` puts them underneath. */
  controls?: "overlay" | "below";
  /** Called with the new index whenever the visible slide changes. */
  onChange?: (index: number) => void;
  /** Moves the carousel to this slide when it changes (thumbnails use it). */
  index?: number;
  className?: string;
  slideClassName?: string;
}

/**
 * The one carousel (ui-context.md, Motion): swipe, dotted pagination and
 * auto-advance, built on Swiper. Swiper handles the slides and the swipe;
 * the timer is ours so every pause reason combines: the pause button,
 * hover, keyboard focus inside, the carousel being off-screen, and the
 * tab being hidden. With reduced motion it never moves on its own and
 * slides change without animating.
 *
 * Follows the WAI-ARIA carousel pattern: a labelled region, slides
 * named "n of m", hidden slides inert, and a live region that is quiet
 * while the carousel plays.
 */
export function Carousel({
  label,
  slides,
  slideLabel = "Slide",
  autoplay = true,
  tone = "light",
  controls = "below",
  onChange,
  index: requested,
  className,
  slideClassName,
}: CarouselProps) {
  const reduceMotion = useReducedMotion() ?? false;
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  const [active, setActive] = useState(0);
  const [stopped, setStopped] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const progress = useRef<HTMLSpanElement>(null);
  const elapsed = useRef(0);

  const count = slides.length;
  const canPlay = autoplay && count > 1 && !reduceMotion;
  const running = canPlay && !stopped && !hovered && !focused && onScreen && pageVisible;

  // Off-screen and hidden-tab pauses.
  useEffect(() => {
    const element = root.current;
    if (!element || !canPlay) return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? true), { threshold: 0.25 });
    observer.observe(element);
    const onVisibility = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [canPlay]);

  // The timer: time builds up only while running, so a pause resumes
  // where it left off. The active dot's fill shows the time left.
  useEffect(() => {
    if (!running || !swiper) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      if (elapsed.current >= motionTokens.carouselIntervalMs) {
        elapsed.current = 0;
        swiper.slideNext();
      }
      if (progress.current) progress.current.style.transform = `scaleX(${String(elapsed.current / motionTokens.carouselIntervalMs)})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, swiper]);

  useEffect(() => {
    if (swiper && requested !== undefined && requested !== swiper.realIndex) swiper.slideTo(requested);
  }, [requested, swiper]);

  const onSlideChange = useCallback(
    (instance: SwiperInstance) => {
      elapsed.current = 0;
      if (progress.current) progress.current.style.transform = "scaleX(0)";
      setActive(instance.realIndex);
      onChange?.(instance.realIndex);
    },
    [onChange],
  );

  function onKeyDown(event: KeyboardEvent) {
    if (!swiper) return;
    if (event.key === "ArrowRight") swiper.slideNext();
    else if (event.key === "ArrowLeft") swiper.slidePrev();
    else return;
    event.preventDefault();
  }

  const inverse = tone === "inverse";
  return (
    <div
      ref={root}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      // Keyboard focus only: a tap on a dot shouldn't stop the carousel for good.
      onFocus={(event) => event.target.matches(":focus-visible") && setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className={cx("relative min-w-0", className)}
    >
      <Swiper
        onSwiper={setSwiper}
        onSlideChange={onSlideChange}
        rewind={count > 1}
        allowTouchMove={count > 1}
        speed={reduceMotion ? 0 : motionTokens.duration.slow}
        grabCursor={count > 1}
        aria-live={running ? "off" : "polite"}
        className="h-full w-full"
      >
        {slides.map((slide, position) => (
          <SwiperSlide
            // Slides are positional content without ids of their own.
            key={position}
            role="group"
            aria-roledescription="slide"
            aria-label={`${slideLabel} ${String(position + 1)} of ${String(count)}`}
            inert={position !== active}
            className={cx("h-auto!", slideClassName)}
          >
            {slide}
          </SwiperSlide>
        ))}
      </Swiper>
      {count > 1 ? (
        <div
          className={cx(
            "flex items-center justify-center",
            controls === "overlay" ? "pointer-events-none absolute inset-x-0 bottom-0 z-10 pt-8" : "mt-2",
            controls === "overlay" && inverse && "bg-linear-to-t from-bg-inverse/55 to-transparent",
          )}
        >
          {canPlay ? (
            <button
              type="button"
              onClick={() => setStopped((value) => !value)}
              aria-label={stopped ? `Play ${label.toLowerCase()}` : `Pause ${label.toLowerCase()}`}
              className={cx(
                "pointer-events-auto flex size-11 items-center justify-center rounded-full transition-colors duration-fast",
                inverse ? "text-text-on-inverse hover:bg-text-on-inverse/15" : "text-text-secondary hover:bg-bg-subtle hover:text-text-primary",
              )}
            >
              {stopped ? <Play aria-hidden="true" className="size-4 fill-current" /> : <Pause aria-hidden="true" className="size-4 fill-current" />}
            </button>
          ) : null}
          <ul className="pointer-events-auto flex items-center">
            {slides.map((_, position) => {
              const current = position === active;
              return (
                <li key={position}>
                  <button
                    type="button"
                    onClick={() => swiper?.slideTo(position)}
                    aria-label={`${slideLabel} ${String(position + 1)} of ${String(count)}`}
                    aria-current={current ? "true" : undefined}
                    className="group flex h-11 w-7 items-center justify-center"
                  >
                    <span
                      aria-hidden="true"
                      className={cx(
                        "relative block h-2 overflow-hidden rounded-full transition-[width,background-color] duration-base ease-standard",
                        current ? "w-6" : "w-2",
                        inverse
                          ? current
                            ? "bg-text-on-inverse/40"
                            : "bg-text-on-inverse/70 group-hover:bg-text-on-inverse"
                          : current
                            ? "bg-accent-primary/25"
                            : "bg-border-strong group-hover:bg-text-secondary",
                      )}
                    >
                      {current ? (
                        <span
                          ref={progress}
                          className={cx(
                            "absolute inset-0 origin-left rounded-full",
                            inverse ? "bg-text-on-inverse" : "bg-accent-primary",
                            // A stopped or still carousel shows the active dot
                            // filled; a hover or focus pause keeps its place.
                            (!canPlay || stopped) && "[transform:scaleX(1)]!",
                          )}
                          style={{ transform: "scaleX(0)" }}
                        />
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
