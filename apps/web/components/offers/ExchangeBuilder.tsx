"use client";

import Image from "next/image";
import { AnimatePresence, LazyMotion, MotionConfig, domAnimation } from "motion/react";
import * as m from "motion/react-m";
import { motion as motionTokens } from "@batr/shared";
import { ExchangeIcon } from "@/components/ui/ExchangeIcon";
import { cx } from "@/components/ui/cx";

export interface ExchangeBuilderProps {
  offering: string;
  wants: string;
  /** The cover thumbnail, shown on the offering side once there is one. */
  photo?: string | null;
  /**
   * The cash in a proposal's terms (Milestone 3, P2), shown between the
   * two sides when set. Offers themselves record no cash.
   */
  cash?: string | null;
  className?: string;
}

const seconds = (ms: number) => ms / 1000;
const join = { duration: seconds(motionTokens.duration.exchange), ease: motionTokens.easing.emphasized };
const quick = { duration: seconds(motionTokens.duration.base), ease: motionTokens.easing.standard };

/**
 * The signature interaction (owner, 2026-10-20): while a member writes
 * the exchange terms, the two sides of their offer wait apart and slide
 * together once both are filled in, with the exchange symbol turning
 * into place between them. Reduced motion shows the same states
 * without movement.
 */
export function ExchangeBuilder({ offering, wants, photo, cash, className }: ExchangeBuilderProps) {
  const hasOffering = offering.trim().length > 0;
  const hasWants = wants.trim().length > 0;
  const joined = hasOffering && hasWants;

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <section aria-labelledby="exchange-builder-heading" className={cx("rounded-xl bg-bg-subtle p-3 sm:p-4", className)}>
          <h3 id="exchange-builder-heading" className="text-caption font-semibold text-text-secondary">
            Your exchange
          </h3>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 sm:gap-3">
            <Side side="offering" filled={hasOffering} joined={joined} text={offering} photo={photo} />
            <div className="flex flex-col items-center gap-1.5">
              <m.span
                aria-hidden="true"
                initial={false}
                animate={joined ? { scale: 1, rotate: 180 } : { scale: 0.8, rotate: 0 }}
                transition={join}
                className={cx(
                  "flex size-10 items-center justify-center rounded-full transition-colors duration-base",
                  joined ? "bg-accent-primary text-text-on-accent shadow-card" : "border border-dashed border-border-strong text-text-muted",
                )}
              >
                <ExchangeIcon className="size-5" />
              </m.span>
              <AnimatePresence initial={false}>
                {joined && cash ? (
                  <m.span
                    key="cash"
                    // No fade: text stays at full contrast while it moves (ui-context.md, Motion).
                    initial={{ scale: 0.6, y: -4 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0, transition: quick }}
                    transition={{ ...join, delay: seconds(motionTokens.duration.base) }}
                    className="rounded-full bg-bg-surface px-2 py-0.5 text-caption font-semibold whitespace-nowrap text-accent-primary shadow-card"
                  >
                    {cash}
                  </m.span>
                ) : null}
              </AnimatePresence>
            </div>
            <Side side="wants" filled={hasWants} joined={joined} text={wants} />
          </div>
          <p aria-live="polite" className="mt-3 text-caption text-text-muted">
            {joined ? "Both sides are in place. This is the exchange members will see." : "Fill in both sides to complete your exchange."}
          </p>
        </section>
      </MotionConfig>
    </LazyMotion>
  );
}

function Side({
  side,
  filled,
  joined,
  text,
  photo,
}: {
  side: "offering" | "wants";
  filled: boolean;
  joined: boolean;
  text: string;
  photo?: string | null;
}) {
  const offering = side === "offering";
  // Apart, each side waits a little way out from the middle; joined, both meet the symbol.
  const apart = offering ? -6 : 6;
  return (
    <m.div
      initial={false}
      animate={{ x: joined ? 0 : apart, scale: joined ? 1 : 0.97 }}
      transition={join}
      className={cx(
        "flex min-h-24 min-w-0 flex-col gap-1 rounded-lg p-2.5 sm:p-3",
        filled ? "bg-bg-surface shadow-card ring-1 ring-border-default/70" : "border border-dashed border-border-strong/70",
        !offering && filled && "bg-accent-soft ring-accent-primary/15",
      )}
    >
      <span className="flex items-center gap-2">
        {offering && photo ? (
          <span className="relative size-7 shrink-0 overflow-hidden rounded-md bg-bg-subtle">
            <Image src={photo} alt="" fill unoptimized sizes="28px" className="object-cover" />
          </span>
        ) : null}
        <span className={cx("text-caption", offering ? "text-text-muted" : "text-accent-primary")}>{offering ? "You offer" : "In return"}</span>
      </span>
      <span className={cx("line-clamp-3 text-body-sm break-words", filled ? "font-medium" : "text-text-muted")}>
        {filled ? text : "Not filled in yet"}
      </span>
    </m.div>
  );
}
