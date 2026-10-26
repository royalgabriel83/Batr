"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  ADJUSTMENT_FACTORS,
  APPEAL_OUTCOMES,
  ASSESSMENT_OUTCOMES,
  COMPARISON_PRICE_KINDS,
  COMPONENT_KINDS,
  CONFIDENCE_LEVELS,
  DETAIL_ENUMS,
  EXCHANGE_TYPES,
  VALUATION_CONDITIONS,
  categoriesFor,
  comparisonRange,
  detailFieldsFor,
  formatKobo,
  parseNaira,
  adjustedPrice,
  type DetailField,
} from "@batr/shared";
import { Button, FormAlert, SegmentedControl, Select, TextField, Textarea } from "@/components/ui";
import { AssessmentCard } from "@/components/valuation/AssessmentCard";
import { EvidenceList } from "@/components/valuation/EvidenceList";
import { FeeBreakdown } from "@/components/valuation/FeeBreakdown";
import { HistoryList } from "@/components/valuation/HistoryList";
import { ValuationStatusBadge } from "@/components/valuation/ValuationStatusBadge";
import { componentTitle, koboToInput } from "@/lib/valuation/format";
import { keyedRequest } from "@/lib/valuation/client";
import type { InspectionView, ReviewValuation, ValuationComponentView } from "@/lib/valuation/types";

const card = "rounded-xl bg-bg-surface p-5 shadow-card ring-1 ring-border-default/70";
const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });
const options = (record: Record<string, string>) => Object.entries(record).map(([value, label]) => ({ value, label }));

function detailText(field: DetailField, value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field.type === "kobo" && typeof value === "number") return formatKobo(value);
  if (field.type === "enum" && field.options && typeof value === "string") {
    return (DETAIL_ENUMS[field.options] as Record<string, string>)[value] ?? value;
  }
  return String(value);
}

function ComponentFacts({ component }: { component: ValuationComponentView }) {
  const fields = detailFieldsFor(component.kind).filter((f) => component.details[f.key] !== undefined);
  return (
    <dl className="grid gap-x-4 gap-y-2 text-body-sm sm:grid-cols-2">
      <div>
        <dt className="text-caption text-text-muted">Kind and category</dt>
        <dd>
          {COMPONENT_KINDS[component.kind]} · {component.category ? categoriesFor(component.kind)[component.category] : "No category"}
          {component.subcategory ? ` · ${component.subcategory}` : ""}
        </dd>
      </div>
      <div>
        <dt className="text-caption text-text-muted">Quantity and proposed value</dt>
        <dd>
          {component.quantity} {component.unit} · {component.proposed_value_kobo ? formatKobo(component.proposed_value_kobo) : "none"}
        </dd>
      </div>
      <div className="sm:col-span-2">
        <dt className="text-caption text-text-muted">Description</dt>
        <dd className="whitespace-pre-line">{component.description}</dd>
      </div>
      {fields.map((field) => (
        <div key={field.key} className={field.type === "long_text" ? "sm:col-span-2" : undefined}>
          <dt className="text-caption text-text-muted">{field.label}</dt>
          <dd className="whitespace-pre-line break-words">{detailText(field, component.details[field.key])}</dd>
        </div>
      ))}
    </dl>
  );
}

interface AdjustmentDraft {
  factor: string;
  percent: string;
  note: string;
}

export function ReviewWorkspace({ initial }: { initial: ReviewValuation }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, Record<string, string>>>({});
  const [alerts, setAlerts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [send] = useState(keyedRequest);

  async function act(section: string, path: string, body: unknown): Promise<boolean> {
    setBusy(section);
    setAlerts((a) => ({ ...a, [section]: "" }));
    const result = await send<ReviewValuation>(section, path, "POST", body);
    setBusy(null);
    if (!result.ok) {
      setErrors((e) => ({ ...e, [section]: result.error.fields ?? {} }));
      setAlerts((a) => ({ ...a, [section]: result.error.message }));
      return false;
    }
    setErrors((e) => ({ ...e, [section]: {} }));
    // Actions return the staff view without the viewer block; keep ours.
    setV((current) => ({ ...result.data, viewer: current.viewer }));
    return true;
  }

  const reviewPath = `/api/v1/review/valuations/${v.id}`;
  const canReview = v.viewer.reviewer && !v.viewer.excluded;
  const deciding = canReview && (v.status === "submitted" || v.status === "inspection_required");
  const openAppeal = v.appeals.find((a) => a.status === "open" || a.status === "assigned") ?? null;
  const appealIsMine = openAppeal?.status === "assigned" && openAppeal.assigned_reviewer_id === v.viewer.id;
  const working = v.status !== "assessed" && v.status !== "not_approved" && v.status !== "withdrawn";
  // A reviewer whose decision was appealed only reads this valuation (the database refuses their changes too).
  const canWrite = !v.viewer.excluded;
  const openAppealNumber = openAppeal?.appeal_number ?? openAppeal?.number ?? 1;

  // Comparison form
  const [comparison, setComparison] = useState({ component_id: v.components[0]?.id ?? "", source: "", url: "", observed_on: "", price_kind: "asking", price: "", condition: "", characteristics: "" });
  const [adjustments, setAdjustments] = useState<AdjustmentDraft[]>([]);
  const [excluding, setExcluding] = useState<{ id: string; reason: string } | null>(null);

  async function addComparison() {
    const ok = await act("comparison", reviewPath, {
      action: "add_comparison",
      comparison: {
        component_id: comparison.component_id || null,
        source: comparison.source,
        url: comparison.url,
        observed_on: comparison.observed_on,
        price_kind: comparison.price_kind,
        price_kobo: parseNaira(comparison.price) ?? 0,
        condition: comparison.condition,
        characteristics: comparison.characteristics,
        adjustments: adjustments.map((a) => ({ factor: a.factor, percent_bp: Math.round(Number(a.percent) * 100), note: a.note })),
      },
    });
    if (ok) {
      setComparison((c) => ({ ...c, source: "", url: "", price: "", condition: "", characteristics: "" }));
      setAdjustments([]);
    }
  }

  // Decision form, shared by first decisions and appeal decisions
  const range = (componentId: string) => comparisonRange(v.comparisons.filter((c) => c.component_id === componentId));
  const [decision, setDecision] = useState(() => ({
    outcome: "approved",
    values: Object.fromEntries(v.components.map((c) => [c.id, koboToInput(range(c.id)?.median ?? c.proposed_value_kobo)])) as Record<string, string>,
    rationale: "",
    confidence: "medium",
    limitations: "",
    message: "",
  }));
  const needsValues = decision.outcome === "approved" || decision.outcome === "revised";
  const decisionBody = () => ({
    expected_revision: v.revision,
    outcome: decision.outcome,
    components: needsValues ? v.components.map((c) => ({ component_id: c.id, value_kobo: parseNaira(decision.values[c.id] ?? "") ?? 0 })) : [],
    rationale: decision.rationale,
    confidence: decision.confidence,
    limitations: decision.limitations,
    message: decision.message,
  });
  const decisionTotal = v.components.reduce((sum, c) => sum + (parseNaira(decision.values[c.id] ?? "") ?? 0), 0);

  // A render function, not a component, so its inputs keep focus between renders.
  function decisionForm(section: string, outcomes: Record<string, string>, submit: () => void) {
    const fieldErrors = errors[section] ?? {};
    return (
      <div className="flex flex-col gap-4">
        <SegmentedControl
          name={`${section}-outcome`}
          legend="Decision"
          options={options(outcomes)}
          value={decision.outcome in outcomes ? decision.outcome : ""}
          onChange={(e) => setDecision((d) => ({ ...d, outcome: e.target.value }))}
          error={fieldErrors.outcome}
        />
        {needsValues ? (
          <div className="flex flex-col gap-3">
            {v.components.map((component) => {
              const r = range(component.id);
              return (
                <TextField
                  key={component.id}
                  id={`${section}-value-${component.id}`}
                  inputMode="decimal"
                  label={`${componentTitle(component)} (₦)`}
                  helper={r ? `Comparisons: ${formatKobo(r.low)} to ${formatKobo(r.high)}, median ${formatKobo(r.median)} (${String(r.count)} included)` : "No comparisons recorded"}
                  value={decision.values[component.id] ?? ""}
                  onChange={(e) => setDecision((d) => ({ ...d, values: { ...d.values, [component.id]: e.target.value } }))}
                />
              );
            })}
            <p className="text-body-sm">
              Total non-cash value: <span className="font-semibold tabular-nums">{formatKobo(decisionTotal)}</span>
              {v.inspection_threshold_kobo !== null && decisionTotal >= v.inspection_threshold_kobo ? " · needs a completed inspection under the current policy" : ""}
            </p>
            {fieldErrors.components ? <p className="text-body-sm text-state-danger">{fieldErrors.components}</p> : null}
          </div>
        ) : null}
        <Textarea id={`${section}-rationale`} label="Rationale" helper="Shown to the member." rows={3} maxLength={2000} value={decision.rationale} error={fieldErrors.rationale} onChange={(e) => setDecision((d) => ({ ...d, rationale: e.target.value }))} />
        <Select id={`${section}-confidence`} label="Confidence" options={options(CONFIDENCE_LEVELS)} value={decision.confidence} onChange={(e) => setDecision((d) => ({ ...d, confidence: e.target.value }))} />
        <Textarea id={`${section}-limitations`} label="Limitations (optional)" rows={2} maxLength={2000} value={decision.limitations} onChange={(e) => setDecision((d) => ({ ...d, limitations: e.target.value }))} />
        <Textarea
          id={`${section}-message`}
          label={decision.outcome.endsWith("_required") ? "What you need from the member" : "Message to the member (optional)"}
          rows={2}
          maxLength={2000}
          value={decision.message}
          error={fieldErrors.message}
          onChange={(e) => setDecision((d) => ({ ...d, message: e.target.value }))}
        />
        {alerts[section] ? <FormAlert tone="danger">{alerts[section]}</FormAlert> : null}
        <Button className="self-start" loading={busy === section} disabled={busy !== null} onClick={submit}>
          Record decision
        </Button>
      </div>
    );
  }

  // Inspections
  const [inspectionForms, setInspectionForms] = useState<Record<string, { when: string; arrangements: string; findings: string; condition: string; reason: string }>>({});
  const formFor = (id: string) => inspectionForms[id] ?? { when: "", arrangements: "", findings: "", condition: "", reason: "" };
  const setForm = (id: string, patch: Partial<ReturnType<typeof formFor>>) => setInspectionForms((f) => ({ ...f, [id]: { ...formFor(id), ...patch } }));
  function inspectionAction(inspection: InspectionView, action: "schedule" | "complete" | "cancel") {
    const form = formFor(inspection.id);
    const body =
      action === "schedule"
        ? { action, scheduled_for: form.when ? new Date(form.when).toISOString() : "", arrangements: form.arrangements }
        : action === "complete"
          ? { action, findings: form.findings, condition_confirmed: form.condition }
          : { action, reason: form.reason };
    void act(`inspection-${inspection.id}`, `/api/v1/review/inspections/${inspection.id}`, body);
  }

  const [note, setNote] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <section className={`${card} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-center gap-3">
          <ValuationStatusBadge status={v.status} />
          <span className="text-caption text-text-muted">
            {EXCHANGE_TYPES[v.exchange_type]}
            {v.cash_component_kobo ? ` · cash ${formatKobo(v.cash_component_kobo)}` : ""} · from {v.submitter.display_name}
            {v.submitted_at ? ` · sent ${dateTime.format(new Date(v.submitted_at))}` : ""}
          </span>
        </div>
        <p className="text-body-sm text-text-secondary">
          Offer: {v.offer.offering_text} · wants {v.offer.wants_text}
        </p>
        {v.repeat_of ? (
          <FormAlert tone="info">
            Repeat of an earlier valuation{v.repeat_of.same_offer ? " of this offer" : " with the same files"} (
            {v.repeat_of.outcome === "approved" ? "value approved" : v.repeat_of.outcome === "not_approved" ? "not approved" : "decided"},{" "}
            {String(v.repeat_of.appeals_used)} of {String(v.appeal_limit)} appeals used{v.repeat_of.final ? ", final" : ""}).{" "}
            <a href={`/review/valuations/${v.repeat_of.id}`} className="font-semibold underline">
              Open it
            </a>
            . The member says what&apos;s new: {v.repeat_reason}
          </FormAlert>
        ) : null}
        {v.viewer.excluded ? <FormAlert tone="info">A decision of yours on this valuation was appealed, so you can read it but other reviewers handle it now.</FormAlert> : null}
        <p className="text-caption text-text-muted">
          Inspection threshold: {v.inspection_threshold_kobo === null ? "not set; decide case by case" : formatKobo(v.inspection_threshold_kobo)}
        </p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <div className="flex flex-col gap-6">
          {v.components.map((component, index) => (
            <section key={component.id} aria-labelledby={`item-${component.id}`} className={`${card} flex flex-col gap-4`}>
              <h2 id={`item-${component.id}`} className="text-h4 tracking-tight">
                {String(index + 1)}. {componentTitle(component)}
              </h2>
              <ComponentFacts component={component} />
              <EvidenceList valuationId={v.id} label="Evidence" items={v.evidence.filter((e) => e.component_id === component.id)} />
            </section>
          ))}
          {v.evidence.some((e) => e.component_id === null) ? (
            <section className={card}>
              <EvidenceList valuationId={v.id} label="Other evidence" items={v.evidence.filter((e) => e.component_id === null)} />
            </section>
          ) : null}
          {v.requests.length > 0 ? (
            <section aria-labelledby="requests-heading" className={card}>
              <h2 id="requests-heading" className="text-h4 tracking-tight">
                Requests for more information
              </h2>
              <ul className="mt-3 flex flex-col gap-3 text-body-sm">
                {v.requests.map((request) => (
                  <li key={request.id}>
                    <p>{request.message}</p>
                    <p className="text-caption text-text-muted">
                      {request.responded_at ? `Answered: ${request.response_note || "no note"}` : "Waiting for the member"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section aria-labelledby="notes-heading" className={`${card} flex flex-col gap-3`}>
            <h2 id="notes-heading" className="text-h4 tracking-tight">
              Internal notes
            </h2>
            <p className="-mt-2 text-caption text-text-muted">Only BATR staff see these.</p>
            {v.notes.map((n) => (
              <p key={n.id} className="text-body-sm">
                <span className="font-semibold">{n.author_name}:</span> {n.body}
              </p>
            ))}
            {canWrite ? (
              <>
                <Textarea id="note" label="Add a note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
                {alerts.note ? <FormAlert tone="danger">{alerts.note}</FormAlert> : null}
                <Button
                  size="sm"
                  variant="secondary"
                  className="self-start"
                  loading={busy === "note"}
                  onClick={() => void act("note", reviewPath, { action: "add_note", body: note }).then((ok) => ok && setNote(""))}
                >
                  Add note
                </Button>
              </>
            ) : null}
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section aria-labelledby="comparisons-heading" className={`${card} flex flex-col gap-4`}>
            <h2 id="comparisons-heading" className="text-h4 tracking-tight">
              Market comparisons
            </h2>
            {v.comparisons.length === 0 ? <p className="text-body-sm text-text-secondary">None recorded yet.</p> : null}
            <ul className="flex flex-col divide-y divide-border-default">
              {v.comparisons.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 py-3 text-body-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className={c.excluded ? "text-text-muted line-through" : "font-medium"}>
                      {c.source} · {COMPARISON_PRICE_KINDS[c.price_kind as keyof typeof COMPARISON_PRICE_KINDS]} · {c.observed_on}
                    </span>
                    <span className="tabular-nums">
                      {formatKobo(c.price_kobo)} → {formatKobo(c.adjusted_kobo)}
                    </span>
                  </div>
                  <span className="text-caption text-text-muted">
                    {c.component_id ? componentTitle(v.components.find((x) => x.id === c.component_id) ?? v.components[0] ?? { kind: "goods", category: null, details: {} }) : "Whole exchange"}
                    {c.adjustments.length > 0
                      ? ` · ${c.adjustments.map((a) => `${ADJUSTMENT_FACTORS[a.factor as keyof typeof ADJUSTMENT_FACTORS]} ${a.percent_bp > 0 ? "+" : ""}${String(a.percent_bp / 100)}%`).join(", ")}`
                      : ""}
                    {c.url ? (
                      <>
                        {" · "}
                        <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-primary underline">
                          link
                        </a>
                      </>
                    ) : null}
                  </span>
                  {c.excluded ? <span className="text-caption">Excluded: {c.exclusion_reason}</span> : null}
                  {working && canReview ? (
                    excluding?.id === c.id ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <TextField id={`exclude-${c.id}`} label="Reason for excluding" value={excluding.reason} onChange={(e) => setExcluding({ id: c.id, reason: e.target.value })} />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            void act("exclude", reviewPath, { action: "exclude_comparison", comparison_id: c.id, excluded: true, reason: excluding.reason }).then((ok) => ok && setExcluding(null))
                          }
                        >
                          Exclude
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="tertiary"
                        className="self-start"
                        onClick={() =>
                          c.excluded ? void act("exclude", reviewPath, { action: "exclude_comparison", comparison_id: c.id, excluded: false, reason: "" }) : setExcluding({ id: c.id, reason: "" })
                        }
                      >
                        {c.excluded ? "Include again" : "Exclude"}
                      </Button>
                    )
                  ) : null}
                </li>
              ))}
            </ul>
            {alerts.exclude ? <FormAlert tone="danger">{alerts.exclude}</FormAlert> : null}
            {working && canReview ? (
              <details className="rounded-lg border border-border-default px-4 py-3">
                <summary className="cursor-pointer text-body-sm font-semibold text-accent-primary">Add a comparison</summary>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Select
                    id="cmp-component"
                    label="For"
                    value={comparison.component_id}
                    onChange={(e) => setComparison((c) => ({ ...c, component_id: e.target.value }))}
                    options={[...v.components.map((c) => ({ value: c.id, label: componentTitle(c) })), { value: "", label: "Whole exchange" }]}
                  />
                  <TextField id="cmp-source" label="Source" placeholder="Shop, listing site, quote" value={comparison.source} error={errors.comparison?.source} onChange={(e) => setComparison((c) => ({ ...c, source: e.target.value }))} />
                  <TextField id="cmp-url" label="Link (optional)" type="url" value={comparison.url} error={errors.comparison?.url} onChange={(e) => setComparison((c) => ({ ...c, url: e.target.value }))} />
                  <TextField id="cmp-date" label="Date seen" type="date" value={comparison.observed_on} error={errors.comparison?.observed_on} onChange={(e) => setComparison((c) => ({ ...c, observed_on: e.target.value }))} />
                  <Select id="cmp-kind" label="Price type" options={options(COMPARISON_PRICE_KINDS)} value={comparison.price_kind} onChange={(e) => setComparison((c) => ({ ...c, price_kind: e.target.value }))} />
                  <TextField id="cmp-price" label="Price (₦)" inputMode="decimal" value={comparison.price} error={errors.comparison?.price_kobo} onChange={(e) => setComparison((c) => ({ ...c, price: e.target.value }))} />
                  <TextField id="cmp-condition" label="Its condition" value={comparison.condition} onChange={(e) => setComparison((c) => ({ ...c, condition: e.target.value }))} />
                  <TextField id="cmp-characteristics" label="How it compares" value={comparison.characteristics} onChange={(e) => setComparison((c) => ({ ...c, characteristics: e.target.value }))} />
                </div>
                <fieldset className="mt-4 flex flex-col gap-3">
                  <legend className="text-body-sm font-semibold">Adjustments</legend>
                  {adjustments.map((a, i) => (
                    <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_7rem_1fr_auto]">
                      <Select id={`adj-${String(i)}-factor`} label="Factor" options={options(ADJUSTMENT_FACTORS)} value={a.factor} onChange={(e) => setAdjustments((list) => list.map((x, j) => (j === i ? { ...x, factor: e.target.value } : x)))} />
                      <TextField id={`adj-${String(i)}-percent`} label="Change %" inputMode="decimal" placeholder="-10" value={a.percent} onChange={(e) => setAdjustments((list) => list.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} />
                      <TextField id={`adj-${String(i)}-note`} label="Why" value={a.note} onChange={(e) => setAdjustments((list) => list.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                      <Button size="sm" variant="tertiary" icon={<Trash2 aria-hidden="true" />} aria-label="Remove adjustment" onClick={() => setAdjustments((list) => list.filter((_, j) => j !== i))}>
                        Remove
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="tertiary" className="self-start" icon={<Plus aria-hidden="true" />} onClick={() => setAdjustments((list) => [...list, { factor: "condition", percent: "", note: "" }])}>
                    Add adjustment
                  </Button>
                  {parseNaira(comparison.price) ? (
                    <p className="text-body-sm">
                      Adjusted price:{" "}
                      <span className="font-semibold tabular-nums">
                        {formatKobo(adjustedPrice(parseNaira(comparison.price) ?? 0, adjustments.map((a) => ({ percent_bp: Math.round(Number(a.percent || 0) * 100) }))))}
                      </span>
                    </p>
                  ) : null}
                </fieldset>
                {alerts.comparison ? <FormAlert tone="danger" className="mt-3">{alerts.comparison}</FormAlert> : null}
                <Button size="sm" className="mt-4" loading={busy === "comparison"} onClick={() => void addComparison()}>
                  Save comparison
                </Button>
              </details>
            ) : null}
          </section>

          {deciding ? (
            <section aria-labelledby="decision-heading" className={card}>
              <h2 id="decision-heading" className="mb-4 text-h4 tracking-tight">
                Decision
              </h2>
              {decisionForm("decide", ASSESSMENT_OUTCOMES, () => void act("decide", reviewPath, { action: "decide", decision: decisionBody() }))}
            </section>
          ) : null}

          {openAppeal ? (
            <section aria-labelledby="appeal-heading" className={`${card} flex flex-col gap-3`}>
              <h2 id="appeal-heading" className="text-h4 tracking-tight">
                Appeal {openAppealNumber} of {v.appeal_limit}
                {openAppealNumber >= v.appeal_limit ? " (final)" : ""}
              </h2>
              <p className="text-body-sm whitespace-pre-line">{openAppeal.reason}</p>
              <p className="text-caption text-text-muted">
                {openAppeal.status === "assigned" ? `Taken by ${openAppeal.assigned_reviewer_name ?? "a reviewer"}` : "Not taken yet"}. Whoever made the decision being appealed, or an earlier appealed decision, can&apos;t take it.
              </p>
              {openAppeal.status === "open" && canReview ? (
                <Button size="sm" className="self-start" loading={busy === "claim"} onClick={() => void act("claim", `/api/v1/review/appeals/${openAppeal.id}`, { action: "claim" })}>
                  Take this appeal
                </Button>
              ) : null}
              {alerts.claim ? <FormAlert tone="danger">{alerts.claim}</FormAlert> : null}
              {appealIsMine
                ? decisionForm("appeal", APPEAL_OUTCOMES, () => void act("appeal", `/api/v1/review/appeals/${openAppeal.id}`, { action: "decide", decision: decisionBody() }))
                : null}
            </section>
          ) : null}

          {v.inspections.length > 0 ? (
            <section aria-labelledby="inspections-heading" className={`${card} flex flex-col gap-4`}>
              <h2 id="inspections-heading" className="text-h4 tracking-tight">
                Inspections
              </h2>
              {v.inspections.map((inspection) => {
                const form = formFor(inspection.id);
                const section = `inspection-${inspection.id}`;
                const open = inspection.status === "requested" || inspection.status === "scheduled";
                return (
                  <div key={inspection.id} className="flex flex-col gap-3 border-t border-border-default pt-3 first:border-t-0 first:pt-0">
                    <p className="text-body-sm">
                      <span className="font-semibold capitalize">{inspection.status}</span> · {inspection.reason}
                    </p>
                    {inspection.scheduled_for ? (
                      <p className="text-body-sm">
                        {dateTime.format(new Date(inspection.scheduled_for))} {inspection.arrangements ? `· ${inspection.arrangements}` : ""}
                        {inspection.inspector_name ? ` · ${inspection.inspector_name}` : ""}
                      </p>
                    ) : null}
                    {inspection.findings ? <p className="text-body-sm whitespace-pre-line">Findings: {inspection.findings}</p> : null}
                    {inspection.condition_confirmed ? (
                      <p className="text-body-sm">Condition: {VALUATION_CONDITIONS[inspection.condition_confirmed as keyof typeof VALUATION_CONDITIONS]}</p>
                    ) : null}
                    {open && canWrite ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TextField id={`${section}-when`} type="datetime-local" label="Date and time" value={form.when} error={errors[section]?.scheduled_for} onChange={(e) => setForm(inspection.id, { when: e.target.value })} />
                        <TextField id={`${section}-arrangements`} label="Place and arrangements" value={form.arrangements} onChange={(e) => setForm(inspection.id, { arrangements: e.target.value })} />
                        <Button size="sm" variant="secondary" className="self-start" onClick={() => inspectionAction(inspection, "schedule")}>
                          Schedule
                        </Button>
                        <span />
                        <Textarea id={`${section}-findings`} label="Findings" rows={3} maxLength={2000} className="sm:col-span-2" value={form.findings} error={errors[section]?.findings} onChange={(e) => setForm(inspection.id, { findings: e.target.value })} />
                        <Select id={`${section}-condition`} label="Condition confirmed (optional)" placeholder="Not assessed" options={options(VALUATION_CONDITIONS)} value={form.condition} onChange={(e) => setForm(inspection.id, { condition: e.target.value })} />
                        <Button size="sm" className="self-end" onClick={() => inspectionAction(inspection, "complete")}>
                          Record as completed
                        </Button>
                        <TextField id={`${section}-reason`} label="Reason to cancel" value={form.reason} error={errors[section]?.reason} onChange={(e) => setForm(inspection.id, { reason: e.target.value })} />
                        <Button size="sm" variant="tertiary" className="self-end" onClick={() => inspectionAction(inspection, "cancel")}>
                          Cancel inspection
                        </Button>
                      </div>
                    ) : null}
                    {alerts[section] ? <FormAlert tone="danger">{alerts[section]}</FormAlert> : null}
                  </div>
                );
              })}
            </section>
          ) : null}

          {[...v.assessments].reverse().map((assessment) => (
            <AssessmentCard key={assessment.id} assessment={assessment} components={v.components} headingLevel={2} />
          ))}

          {v.fee_quote ? <FeeBreakdown quote={v.fee_quote} perspective="staff" /> : null}

          <section aria-labelledby="history-heading" className={card}>
            <h2 id="history-heading" className="mb-4 text-h4 tracking-tight">
              History
            </h2>
            <HistoryList history={v.history} />
          </section>
        </div>
      </div>
    </div>
  );
}
