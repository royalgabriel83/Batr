import Image from "next/image";
import { PackageOpen, TriangleAlert } from "lucide-react";
import { ExchangeIcon } from "@/components/ui/ExchangeIcon";
import { cx } from "@/components/ui/cx";
import { itemLabel, type ItemView } from "@/lib/proposals/terms";

export interface TermsPairProps {
  give: ItemView[];
  get: ItemView[];
  /** "You pay ₦20,000", shown between the sides. */
  cash?: string | null;
  giveLabel?: string;
  getLabel?: string;
  /** Smaller, for earlier revisions and list rows. */
  compact?: boolean;
  className?: string;
}

/**
 * One set of terms as an exchange pair (specs/milestone-3.md, user
 * journey 6): what the viewer gives, the exchange symbol with any cash,
 * and what they get. Offer items show their snapshot, never the live
 * offer, and say when the live offer has changed since.
 */
export function TermsPair({
  give,
  get,
  cash,
  giveLabel = "You give",
  getLabel = "You get",
  compact,
  className,
}: TermsPairProps) {
  // Sized by its container, so it also stacks inside a narrow dialog.
  return (
    <div className={cx("@container", className)}>
      <div className="grid grid-cols-1 items-stretch gap-2 @xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] @xl:gap-3">
        <Side label={giveLabel} items={give} compact={compact} />
        <div className="flex items-center justify-center gap-2 @xl:flex-col">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-accent-primary text-text-on-accent shadow-card"
          >
            <ExchangeIcon className="size-4" />
          </span>
          {cash ? (
            <span className="rounded-full bg-bg-surface px-2.5 py-1 text-caption font-semibold whitespace-nowrap text-accent-primary shadow-card ring-1 ring-border-default/70">
              {cash}
            </span>
          ) : null}
        </div>
        <Side label={getLabel} items={get} compact={compact} accent />
      </div>
    </div>
  );
}

function Side({
  label,
  items,
  compact,
  accent,
}: {
  label: string;
  items: ItemView[];
  compact?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex min-w-0 flex-col gap-2 rounded-lg p-3",
        accent
          ? "bg-accent-soft"
          : "bg-bg-surface ring-1 ring-border-default/70",
      )}
    >
      <p
        className={cx(
          "text-caption font-semibold",
          accent ? "text-accent-primary" : "text-text-muted",
        )}
      >
        {label}
      </p>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={
              item.kind === "offer" ? item.offer_id : `text:${item.description}`
            }
            className="flex min-w-0 items-center gap-2.5"
          >
            <Thumb item={item} compact={compact} />
            <span className="flex min-w-0 flex-col">
              <span
                className={cx(
                  "break-words",
                  compact ? "text-body-sm" : "text-body-sm font-medium",
                )}
              >
                {itemLabel(item)}
              </span>
              {item.kind === "offer" && item.changed ? (
                <span className="flex items-center gap-1 text-caption text-state-warning">
                  <TriangleAlert aria-hidden="true" className="size-3.5" />
                  Changed since these terms
                </span>
              ) : item.kind === "text" ? (
                <span className="text-caption text-text-muted">
                  Described item
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Thumb({ item, compact }: { item: ItemView; compact?: boolean }) {
  const size = compact ? "size-8" : "size-11";
  if (item.kind === "offer" && item.snapshot.photo?.thumb_url) {
    return (
      <span
        className={cx(
          "relative shrink-0 overflow-hidden rounded-md bg-bg-subtle",
          size,
        )}
      >
        <Image
          src={item.snapshot.photo.thumb_url}
          alt=""
          fill
          unoptimized
          sizes="44px"
          className="object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cx(
        "flex shrink-0 items-center justify-center rounded-md bg-bg-subtle text-text-muted",
        size,
      )}
    >
      <PackageOpen className="size-4" />
    </span>
  );
}
