"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Scale } from "lucide-react";
import {
  APPEAL_OUTCOMES,
  COMPARISON_PRICE_KINDS,
  EXCHANGE_TYPES,
  VALUATION_CONDITIONS,
  formatKobo,
  type ValuationCondition,
} from "@batr/shared";
import { Button, FormAlert, Textarea } from "@/components/ui";
import { ConfirmDialog } from "@/components/offers/ConfirmDialog";
import { AssessmentCard } from "@/components/valuation/AssessmentCard";
import { EvidenceList } from "@/components/valuation/EvidenceList";
import { FeeBreakdown } from "@/components/valuation/FeeBreakdown";
import { HistoryList } from "@/components/valuation/HistoryList";
import { ValuationStatusBadge } from "@/components/valuation/ValuationStatusBadge";
import { componentTitle } from "@/lib/valuation/format";
import { keyedRequest } from "@/lib/valuation/client";
import type { MemberValuation } from "@/lib/valuation/types";
import { ValuationForm } from "./ValuationForm";

const dateTime = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

const STATUS_TEXT: Record<MemberValuation["status"], string> = {
  draft: "Fill in the details and add evidence, then send it for review.",
  submitted: "A BATR reviewer will compare it with the market and record a value.",
  evidence_requested: "BATR needs more information before it can value this.",
  inspection_required: "BATR needs to inspect the item in person before approving a value.",
  assessed: "BATR has recorded a value for what you're offering.",
  appealed: "Your appeal is with a different reviewer from the one who made the decision.",
  not_approved: "BATR couldn't approve a value under the current policy.",
  withdrawn: "You withdrew this valuation.",
};

const card = "rounded-xl bg-bg-surface p-5 shadow-card ring-1 ring-border-default/70 md:p-6";

export interface ValuationWorkspaceProps {
  offerId: string;
  initial: MemberValuation | null;
  offerClosed: boolean;
}

/** The owner's valuation of their offer: start one, fill it in, or follow it through review and appeal. */
export function ValuationWorkspace({ offerId, initial, offerClosed }: ValuationWorkspaceProps) {
  const router = useRouter();
  const [valuation, setValuation] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [send] = useState(keyedRequest);

  async function start() {
    setBusy("start");
    setError(null);
    const result = await send<MemberValuation>("start", `/api/v1/offers/${offerId}/valuation`, "POST");
    setBusy(null);
    if (!result.ok) setError(result.error.message);
    else setValuation(result.data);
  }

  if (!valuation || valuation.status === "withdrawn" || (valuation.status === "not_approved" && valuation.appeals.length > 0 && valuation.appeals_remaining === 0)) {
    const previous = valuation;
    return (
      <div className="flex flex-col gap-6">
        <section className={card}>
          <h2 className="text-h3 tracking-tight">Get BATR&apos;s valuation</h2>
          <p className="mt-2 max-w-prose text-body text-text-secondary">
            Tell BATR about what you&apos;re offering and add photos and documents. A reviewer compares it with real prices and records a value
            with the reasons. The 3% platform fee on an exchange is based on that value, split equally between you and the other member.
          </p>
          <ul className="mt-4 flex list-disc flex-col gap-1 pl-5 text-body-sm text-text-secondary">
            <li>Physical items need at least two photos of the actual item from different angles.</li>
            <li>Receipts and documents stay private to you and BATR reviewers.</li>
            <li>You can appeal a decision up to two times. A different reviewer decides each appeal, and the second is final.</li>
          </ul>
          {previous ? (
            <p className="mt-4 text-body-sm text-text-muted">
              Your last valuation was {previous.status === "withdrawn" ? "withdrawn" : "not approved"}. You can start a new one
              {previous.assessments.length > 0 ? ", with new evidence or changed details, since BATR already decided the last one" : ""}.
            </p>
          ) : null}
          {error ? <FormAlert tone="danger" className="mt-4">{error}</FormAlert> : null}
          {offerClosed ? (
            <p className="mt-4 text-body-sm text-text-secondary">This offer is closed, so it can&apos;t be valued.</p>
          ) : (
            <Button className="mt-5" loading={busy === "start"} onClick={() => void start()}>
              Start a valuation
            </Button>
          )}
        </section>
      </div>
    );
  }

  const v = valuation;
  const latest = v.assessments.at(-1) ?? null;
  const canAppeal = (v.status === "assessed" || v.status === "not_approved") && latest !== null && v.appeals_remaining > 0;
  const appealsUsed = v.appeals.length > 0 && v.appeals_remaining === 0 && v.status === "assessed";
  const canWithdraw = v.status !== "withdrawn" && v.status !== "not_approved";

  async function sendAppeal() {
    const text = reason.trim();
    if (text.length < 20) {
      setReasonError("Explain why in at least 20 characters.");
      return;
    }
    setReasonError(undefined);
    setBusy("appeal");
    const result = await send<MemberValuation>("appeal", `/api/v1/valuations/${v.id}/appeal`, "POST", { expected_revision: v.revision, reason: text });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      if (result.error.code === "CONFLICT") router.refresh();
    } else setValuation(result.data);
  }

  async function withdraw() {
    setBusy("withdraw");
    const result = await send<MemberValuation>("withdraw", `/api/v1/valuations/${v.id}/withdraw`, "POST", { expected_revision: v.revision });
    setBusy(null);
    setConfirmWithdraw(false);
    if (!result.ok) setError(result.error.message);
    else setValuation(result.data);
  }

  const editable = v.status === "draft" || v.status === "evidence_requested";

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Valuation status" className={`${card} flex flex-col gap-2`}>
        <div className="flex flex-wrap items-center gap-3">
          <ValuationStatusBadge status={v.status} />
          <span className="text-caption text-text-muted">{EXCHANGE_TYPES[v.exchange_type]}</span>
        </div>
        <p className="text-body text-text-secondary">{STATUS_TEXT[v.status]}</p>
        {error ? <FormAlert tone="danger">{error}</FormAlert> : null}
      </section>

      {editable ? <ValuationForm valuation={v} onChange={setValuation} /> : null}

      {!editable ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-6">
            {latest ? <AssessmentCard assessment={latest} components={v.components} headingLevel={2} /> : null}

            {v.inspections.length > 0 ? (
              <section aria-labelledby="inspection-heading" className={card}>
                <h2 id="inspection-heading" className="text-h4 tracking-tight">
                  Inspection
                </h2>
                {v.inspections.map((inspection) => (
                  <div key={inspection.id} className="mt-3 flex flex-col gap-1 text-body-sm">
                    <p className="font-medium capitalize">{inspection.status}</p>
                    <p className="text-text-secondary">{inspection.reason}</p>
                    {inspection.scheduled_for ? (
                      <p>
                        {dateTime.format(new Date(inspection.scheduled_for))}
                        {inspection.arrangements ? ` · ${inspection.arrangements}` : ""}
                      </p>
                    ) : null}
                    {inspection.findings ? <p className="whitespace-pre-line">Findings: {inspection.findings}</p> : null}
                    {inspection.condition_confirmed ? (
                      <p>Condition confirmed: {VALUATION_CONDITIONS[inspection.condition_confirmed as ValuationCondition]}</p>
                    ) : null}
                    {inspection.cancelled_reason ? <p className="text-text-muted">{inspection.cancelled_reason}</p> : null}
                  </div>
                ))}
              </section>
            ) : null}

            {v.comparisons.length > 0 ? (
              <section aria-labelledby="comparisons-heading" className={card}>
                <h2 id="comparisons-heading" className="text-h4 tracking-tight">
                  Prices BATR compared
                </h2>
                <ul className="mt-3 flex flex-col divide-y divide-border-default text-body-sm">
                  {v.comparisons.map((comparison) => (
                    <li key={comparison.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        {comparison.source} · {COMPARISON_PRICE_KINDS[comparison.price_kind as keyof typeof COMPARISON_PRICE_KINDS]} ·{" "}
                        {comparison.observed_on}
                      </span>
                      <span className="tabular-nums">
                        {formatKobo(comparison.price_kobo)}
                        {comparison.adjusted_kobo !== comparison.price_kobo ? ` → ${formatKobo(comparison.adjusted_kobo)} adjusted` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {v.appeals.length > 0 ? (
              <section aria-labelledby="appeal-heading" className={card}>
                <h2 id="appeal-heading" className="flex items-center gap-2 text-h4 tracking-tight">
                  <Scale aria-hidden="true" className="size-5 text-accent-primary" />
                  {v.appeals.length === 1 ? "Your appeal" : "Your appeals"}
                </h2>
                <ol className="mt-2 flex flex-col gap-4">
                  {v.appeals.map((appeal, index) => (
                    <li key={appeal.id} className="flex flex-col gap-1">
                      {v.appeals.length > 1 || v.appeal_limit > 1 ? (
                        <p className="text-caption font-semibold text-text-muted">
                          Appeal {appeal.number ?? index + 1} of {v.appeal_limit}
                          {(appeal.number ?? index + 1) >= v.appeal_limit ? " (final)" : ""}
                        </p>
                      ) : null}
                      <p className="text-body-sm whitespace-pre-line text-text-secondary">{appeal.reason}</p>
                      {appeal.outcome ? (
                        <p className="text-body-sm">
                          <span className="font-semibold">{APPEAL_OUTCOMES[appeal.outcome]}.</span> {appeal.decision_rationale}
                        </p>
                      ) : (
                        <p className="text-body-sm">A different reviewer is looking at it. You can add evidence below.</p>
                      )}
                    </li>
                  ))}
                </ol>
                {appealsUsed ? (
                  <p className="mt-4 text-caption text-text-muted">
                    You&apos;ve used both appeals and this decision is final. To add new evidence, withdraw this valuation and start a new one.
                  </p>
                ) : null}
              </section>
            ) : null}

            {canAppeal ? (
              <section aria-labelledby="appeal-form-heading" className={card}>
                <h2 id="appeal-form-heading" className="text-h4 tracking-tight">
                  Disagree with the decision?
                </h2>
                <p className="mt-1 text-body-sm text-text-secondary">
                  {v.appeals_remaining >= v.appeal_limit
                    ? `You can appeal ${v.appeal_limit === 1 ? "once" : "twice"}. Each appeal goes to a reviewer who didn't make the decision you're appealing, and the last decision is final.`
                    : "This is your last appeal. A reviewer who didn't make the decision you're appealing decides, and their decision is final."}{" "}
                  Say what was missed and add any new evidence after you send it.
                </p>
                <Textarea id="appeal-reason" label="Why you're appealing" rows={4} maxLength={2000} className="mt-4" value={reason} error={reasonError} onChange={(e) => setReason(e.target.value)} />
                <Button className="mt-4" variant="secondary" loading={busy === "appeal"} onClick={() => void sendAppeal()}>
                  Send appeal
                </Button>
              </section>
            ) : null}

            <section aria-labelledby="submitted-heading" className={card}>
              <h2 id="submitted-heading" className="text-h4 tracking-tight">
                What you sent
              </h2>
              <ul className="mt-3 flex flex-col gap-4">
                {v.components.map((component) => (
                  <li key={component.id} className="flex flex-col gap-2">
                    <p className="text-body-sm font-semibold">
                      {componentTitle(component)}
                      {component.proposed_value_kobo ? (
                        <span className="font-normal text-text-secondary"> · you proposed {formatKobo(component.proposed_value_kobo)}</span>
                      ) : null}
                    </p>
                    <EvidenceList
                      valuationId={v.id}
                      label="Files"
                      items={v.evidence.filter((e) => e.component_id === component.id)}
                      kinds={v.status === "appealed" ? ["photo", "receipt", "invoice", "warranty", "repair_record", "portfolio", "supporting_document"] : []}
                      componentId={component.id}
                      onChange={setValuation}
                    />
                  </li>
                ))}
                {v.exchange_type !== "pure_barter" ? (
                  <li className="text-body-sm">
                    {v.exchange_type === "cash_only" ? "Agreed cash" : "Cash on top"}: {formatKobo(v.cash_component_kobo)}
                  </li>
                ) : null}
              </ul>
            </section>
          </div>

          <div className="flex flex-col gap-6 lg:sticky lg:top-24">
            {v.fee_quote ? <FeeBreakdown quote={v.fee_quote} /> : null}
            <section aria-labelledby="history-heading" className={card}>
              <h2 id="history-heading" className="mb-4 text-h4 tracking-tight">
                History
              </h2>
              <HistoryList history={v.history} />
            </section>
            {canWithdraw ? (
              <Button variant="tertiary" onClick={() => setConfirmWithdraw(true)}>
                Withdraw this valuation
              </Button>
            ) : null}
          </div>
        </div>
      ) : canWithdraw && v.status !== "draft" ? (
        <Button variant="tertiary" className="self-start" onClick={() => setConfirmWithdraw(true)}>
          Withdraw this valuation
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirmWithdraw}
        title="Withdraw this valuation?"
        confirmLabel="Withdraw"
        busy={busy === "withdraw"}
        onConfirm={() => void withdraw()}
        onCancel={() => setConfirmWithdraw(false)}
      >
        <p>BATR stops reviewing it and any fee quote is cancelled. Your evidence stays in its history. You can start a new valuation later.</p>
      </ConfirmDialog>
    </div>
  );
}
