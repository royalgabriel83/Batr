import { CONFIDENCE_LEVELS, formatKobo } from "@batr/shared";
import type { AssessmentView, ValuationComponentView } from "@/lib/valuation/types";
import { componentTitle } from "@/lib/valuation/format";

/** One assessment version: the values, why, how confident, and what it couldn't check. */
export function AssessmentCard({
  assessment,
  components,
  headingLevel = 3,
}: {
  assessment: AssessmentView;
  components: ValuationComponentView[];
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const approved = assessment.outcome === "approved";
  return (
    <article className="flex flex-col gap-4 rounded-xl bg-bg-surface p-5 shadow-card ring-1 ring-border-default/70">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading className="text-h4 tracking-tight">{approved ? "BATR's assessed value" : "Not approved"}</Heading>
        <span className="text-caption text-text-muted">
          Version {assessment.version}
          {assessment.appeal_id ? " · after appeal" : ""}
          {assessment.reviewer_name ? ` · ${assessment.reviewer_name}` : ""}
        </span>
      </div>
      {approved ? <p className="font-display text-display tabular-nums">{formatKobo(assessment.total_noncash_kobo)}</p> : null}
      {approved && assessment.components.length > 1 ? (
        <dl className="flex flex-col gap-1 text-body-sm">
          {assessment.components.map((value) => {
            const component = components.find((c) => c.id === value.component_id);
            return (
              <div key={value.component_id} className="flex justify-between gap-4">
                <dt className="text-text-secondary">{component ? componentTitle(component) : "Item"}</dt>
                <dd className="font-medium tabular-nums">{formatKobo(value.value_kobo)}</dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
        <div>
          <dt className="text-caption text-text-muted">Confidence</dt>
          <dd className="font-medium">{CONFIDENCE_LEVELS[assessment.confidence]}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-muted">Physical inspection</dt>
          <dd className="font-medium">{assessment.inspected || assessment.inspection_id ? "Inspected" : "Not inspected"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-caption text-text-muted">Why</dt>
          <dd className="whitespace-pre-line">{assessment.rationale}</dd>
        </div>
        {assessment.limitations ? (
          <div className="sm:col-span-2">
            <dt className="text-caption text-text-muted">Limitations</dt>
            <dd className="whitespace-pre-line">{assessment.limitations}</dd>
          </div>
        ) : null}
        {assessment.message ? (
          <div className="sm:col-span-2">
            <dt className="text-caption text-text-muted">Message from BATR</dt>
            <dd className="whitespace-pre-line">{assessment.message}</dd>
          </div>
        ) : null}
      </dl>
      <p className="text-caption text-text-muted">
        An estimate based on the information and evidence provided. It isn&apos;t a guarantee of condition, authenticity or price. Valuation
        policy {assessment.policy_version}.
      </p>
    </article>
  );
}
