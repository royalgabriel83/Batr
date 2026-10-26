import type { SVGProps } from "react";
import { cx } from "./cx";

/**
 * BATR's exchange symbol (owner, 2026-10-17): two opposing curved
 * arrows, one over the top and one under, rotationally symmetric with
 * matching arrowheads. Drawn on Lucide's 24px grid with round caps and
 * the `lucide` class, so the stroke rules in globals.css apply as they
 * do to every other icon. Decorative unless given a label.
 */
export function ExchangeIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props["aria-label"] ? undefined : true}
      className={cx("lucide", className)}
      {...props}
    >
      <path d="M4.76 10.06A7.5 7.5 0 0 1 19.24 10.06" />
      <path d="M21.14 6.77 19.24 10.06 15.95 8.16" />
      <path d="M19.24 13.94A7.5 7.5 0 0 1 4.76 13.94" />
      <path d="M2.86 17.23 4.76 13.94 8.05 15.84" />
    </svg>
  );
}
