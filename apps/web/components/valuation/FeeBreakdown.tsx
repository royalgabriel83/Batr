import { Info } from "lucide-react";
import { EXCHANGE_TYPES, formatKobo } from "@batr/shared";
import type { FeeQuoteView } from "@/lib/valuation/types";
import { cx } from "@/components/ui/cx";

const percent = (bp: number) => `${String(bp / 100)}%`;

/**
 * The platform fee on a valuation (owner, 2026-10-17): one fee on the
 * fee basis, split equally. It is a quote: nothing is owed until both
 * members agree an exchange, and BATR can't collect payments yet.
 */
export function FeeBreakdown({
  quote,
  className,
  headingLevel = 2,
  perspective = "owner",
}: {
  quote: FeeQuoteView;
  className?: string;
  headingLevel?: 2 | 3;
  /** "owner": the offer's owner is reading; "staff": a BATR reviewer is. */
  perspective?: "owner" | "staff";
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const rows: [string, string][] = [];
  if (quote.exchange_type !== "cash_only") rows.push(["BATR's assessed value", formatKobo(quote.assessed_noncash_kobo)]);
  if (quote.cash_kobo > 0) rows.push([quote.exchange_type === "cash_only" ? "Agreed cash" : "Cash on top", formatKobo(quote.cash_kobo)]);
  return (
    <section aria-labelledby={`fee-${quote.id}`} className={cx("rounded-xl bg-bg-surface p-5 shadow-card ring-1 ring-border-default/70", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading id={`fee-${quote.id}`} className="text-h4 tracking-tight">
          Platform fee
        </Heading>
        <span className="text-caption text-text-muted">{EXCHANGE_TYPES[quote.exchange_type]}</span>
      </div>
      {quote.requires_reconfirmation ? (
        <p role="status" className="mt-3 rounded-lg bg-state-warning-soft px-3 py-2 text-body-sm text-state-warning">
          The value changed, so the fee changed too. Both members will need to confirm the new fee before an exchange goes ahead.
        </p>
      ) : null}
      <dl className="mt-4 flex flex-col gap-2 text-body-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="font-medium tabular-nums">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-4 border-t border-border-default pt-2">
          <dt className="text-text-secondary">Fee basis</dt>
          <dd className="font-medium tabular-nums">{formatKobo(quote.fee_basis_kobo)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">Platform fee ({percent(quote.fee_bp)}, charged once)</dt>
          <dd className="font-semibold tabular-nums">{formatKobo(quote.total_fee_kobo)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">{perspective === "owner" ? "You pay (half)" : "Offer owner pays (half)"}</dt>
          <dd className="font-medium tabular-nums">{formatKobo(quote.party_a_share_kobo)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-text-secondary">The other member pays (half)</dt>
          <dd className="font-medium tabular-nums">{formatKobo(quote.party_b_share_kobo)}</dd>
        </div>
      </dl>
      <p className="mt-4 flex items-start gap-2 text-caption text-text-muted">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          This is a quote, not a bill: nothing is owed yet. The fee becomes due only when both members accept the final agreement, before the
          exchange begins, and paying it in BATR isn&apos;t available yet. It isn&apos;t escrow, insurance or a guarantee. Any cash you exchange
          with the other member is separate from this fee and BATR doesn&apos;t hold it. Fee policy {quote.policy_version}.
        </span>
      </p>
    </section>
  );
}
