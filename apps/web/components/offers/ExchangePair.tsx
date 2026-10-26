import { ExchangeIcon } from "@/components/ui/ExchangeIcon";
import { cx } from "@/components/ui/cx";

export interface ExchangePairProps {
  offering: string;
  wants: string;
  /** `compact` on My offers; `return` on cards and the editor preview; `panel` on the offer page. */
  variant?: "compact" | "return" | "panel";
  /** A service's offering side reads "What the service includes" (milestone 9, V5). */
  service?: boolean;
  className?: string;
}

const empty = "Not filled in yet";

/**
 * The exchange pair, BATR's signature element (ui-context.md, owner
 * 2026-10-17): what the member is offering and what they want, joined
 * by the green exchange symbol. The symbol is decorative; the two
 * labels carry the meaning.
 *
 * Compact stacks the two sides as label-value rows, one line each, so
 * every card has the same shape whatever the text length (owner
 * review, 2026-10-17: long titles and text must stay balanced). The
 * panel stacks the two sides with the symbol on the line between, and
 * `return` shows only what is wanted, on cards (approved reference,
 * owner 2026-10-17).
 */
export function ExchangePair({ offering, wants, variant = "compact", service = false, className }: ExchangePairProps) {
  if (variant === "panel") {
    // The reference's "What I'm looking for in return" block, with both
    // sides: what is offered above, what is wanted below, joined by the
    // exchange symbol on the dividing line.
    return (
      <div className={cx("relative rounded-xl bg-bg-surface shadow-card ring-1 ring-border-default/70", className)}>
        {/* The two sides arrive from either side of the line and meet at the symbol. */}
        <dl className="flex animate-exchange-above flex-col gap-1 p-5 pr-16">
          <dt className="text-caption text-text-muted">{service ? "What the service includes" : "Offering"}</dt>
          <dd className="text-h4 break-words">{offering || empty}</dd>
        </dl>
        <div className="relative rounded-b-xl border-t border-border-default bg-accent-soft">
          <span
            aria-hidden="true"
            className="absolute -top-5 right-5 z-10 flex size-10 animate-exchange-mark items-center justify-center rounded-full bg-accent-primary text-text-on-accent ring-4 ring-bg-surface"
          >
            <ExchangeIcon className="size-5" />
          </span>
          <dl className="flex animate-exchange-below flex-col gap-1 p-5 pr-16">
            <dt className="text-caption text-accent-primary">In return, they&apos;re looking for</dt>
            <dd className="text-h4 break-words">{wants || empty}</dd>
          </dl>
        </div>
      </div>
    );
  }
  if (variant === "return") {
    // The reference card's bottom row: the exchange symbol and what the owner wants.
    return (
      <div className={cx("flex items-center gap-2.5 rounded-lg bg-accent-soft px-2.5 py-2", className)}>
        <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-primary text-text-on-accent">
          <ExchangeIcon className="size-3.5" />
        </span>
        <dl className="flex min-w-0 flex-col">
          <dt className="text-caption text-accent-primary">In return</dt>
          <dd className="truncate text-body-sm font-medium">{wants || empty}</dd>
        </dl>
      </div>
    );
  }
  const row = "grid grid-cols-[3.5rem_minmax(0,1fr)] items-baseline gap-x-2";
  return (
    <div className={cx("rounded-lg bg-bg-base px-3 py-2", className)}>
      <dl className={row}>
        <dt className="text-caption text-text-muted">{service ? "Includes" : "Offering"}</dt>
        <dd className="truncate text-body-sm">{offering || empty}</dd>
      </dl>
      <div aria-hidden="true" className="flex items-center gap-2 py-0.5 text-accent-primary">
        <span className="h-px flex-1 bg-border-default" />
        <ExchangeIcon className="size-4 rotate-90" />
        <span className="h-px flex-1 bg-border-default" />
      </div>
      <dl className={row}>
        <dt className="text-caption text-accent-primary">Wants</dt>
        <dd className="truncate text-body-sm">{wants || empty}</dd>
      </dl>
    </div>
  );
}
