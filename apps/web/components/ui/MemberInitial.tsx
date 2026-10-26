import { cx } from "./cx";

export type MemberInitialSize = "sm" | "md" | "lg";

export interface MemberInitialProps {
  /** The member's display name; when there is none the circle is left empty. */
  name: string | null;
  size?: MemberInitialSize;
  /** `inverse` on the ink header. */
  surface?: "default" | "inverse";
  className?: string;
}

const sizes: Record<MemberInitialSize, string> = {
  sm: "size-5 text-caption",
  md: "size-6 text-caption",
  lg: "size-10 text-body",
};

const surfaces = {
  default: "border-border-default bg-bg-subtle text-text-secondary",
  inverse: "border-text-on-inverse-muted/40 text-text-on-inverse",
};

/** First letter of a display name, for the initial (whole characters, so an emoji or accent stays intact). */
export function initialOf(name: string | null): string {
  return Array.from(name?.trim() ?? "")[0]?.toLocaleUpperCase() ?? "";
}

/**
 * A neutral circle with the member's initial, shown next to their name.
 * Interim stand-in until optional profile photos (deferred to
 * Milestone 2); never a person illustration. Decorative: the name is
 * always written beside it.
 */
export function MemberInitial({ name, size = "sm", surface = "default", className }: MemberInitialProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full border leading-none font-semibold select-none",
        sizes[size],
        surfaces[surface],
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}
