import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { CONFIDENCE_LEVELS, formatKobo, type ConfidenceLevel } from "@batr/shared";

export interface ValuationSummaryData {
  total_noncash_kobo: number;
  confidence: ConfidenceLevel;
  inspected: boolean;
  assessed_at: string;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

/**
 * For signed-out visitors (owner, 2026-10-18: the assessed value is for
 * signed-in members only): says BATR assessed the offer, nothing more.
 */
export function AssessedIndicator({ offerId }: { offerId: string }) {
  return (
    <section aria-labelledby="valuation-summary" className="flex flex-col gap-1 rounded-xl border border-border-default bg-bg-surface p-4">
      <h2 id="valuation-summary" className="flex items-center gap-2 text-caption text-text-muted">
        <BadgeCheck aria-hidden="true" className="size-4 text-accent-primary" />
        Assessed by BATR
      </h2>
      <p className="text-body-sm text-text-secondary">
        <Link href={`/sign-in?next=${encodeURIComponent(`/offers/${offerId}`)}`} className="font-semibold text-accent-primary underline">
          Sign in
        </Link>{" "}
        to see the assessed value.
      </p>
    </section>
  );
}

/** On an offer page, for signed-in members: BATR's latest approved value of the offer, with what it is and isn't. */
export function ValuationSummary({ summary }: { summary: ValuationSummaryData }) {
  return (
    <section aria-labelledby="valuation-summary" className="flex flex-col gap-1 rounded-xl border border-border-default bg-bg-surface p-4">
      <h2 id="valuation-summary" className="flex items-center gap-2 text-caption text-text-muted">
        <BadgeCheck aria-hidden="true" className="size-4 text-accent-primary" />
        Assessed by BATR
      </h2>
      <p className="font-display text-h2 tabular-nums">{formatKobo(summary.total_noncash_kobo)}</p>
      <p className="text-body-sm text-text-secondary">
        {CONFIDENCE_LEVELS[summary.confidence]} confidence · {summary.inspected ? "Inspected in person" : "From photos and documents"} ·{" "}
        {dateFormat.format(new Date(summary.assessed_at))}
      </p>
      <p className="text-caption text-text-muted">An estimate from the evidence the member provided, not a guarantee.</p>
    </section>
  );
}
