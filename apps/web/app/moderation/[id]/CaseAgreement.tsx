import { AGREEMENT_STATUS_LABELS, PROBLEM_MONEY_NOTE, formatNaira, type AgreementStatus } from "@batr/shared";
import { FormAlert } from "@/components/ui";
import { formatRecordTime } from "@/lib/proposals/terms";
import type { CaseAgreementView } from "@/server/api/safety";

// D3 and D6: the exchange a problem is about, as the record shows it.
// Members are named by display name only; times use the record format.

const EVENT_LABELS: Record<string, string> = {
  create: "Agreed",
  handover: "Confirmed their handover",
  propose_change: "Proposed a change",
  accept_change: "Accepted a change",
  reject_change: "Rejected a change",
  withdraw_change: "Withdrew a change",
  request_cancel: "Asked to cancel",
  accept_cancel: "Accepted cancelling",
  reject_cancel: "Kept the agreement",
  withdraw_cancel: "Withdrew the request to cancel",
  problem_reported: "A problem was reported",
  problem_reviewed: "BATR reviewed the problem",
  moderation_cancel: "BATR cancelled the agreement",
};

const card = "flex flex-col gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70 md:p-5";

export function CaseAgreement({
  agreement,
  memberName,
  reporterName,
}: {
  agreement: CaseAgreementView;
  memberName: string;
  reporterName: string;
}) {
  const nameOf = (role: "owner" | "proposer") => (role === agreement.reporter_role ? reporterName : memberName);
  const terms = agreement.terms;
  const proposer = nameOf("proposer");
  const owner = nameOf("owner");
  return (
    <section aria-labelledby="agreement-heading" className={card}>
      <div className="flex flex-col gap-1">
        <h2 id="agreement-heading" className="text-h3">
          The exchange
        </h2>
        <p className="text-caption text-text-muted">
          {AGREEMENT_STATUS_LABELS[agreement.status as AgreementStatus]}
          {agreement.paused ? " · Paused while BATR reviews this case" : ""} · agreed {formatRecordTime(agreement.created_at)}
        </p>
      </div>
      <FormAlert tone="info">{PROBLEM_MONEY_NOTE}</FormAlert>
      {terms ? (
        <dl className="grid gap-x-4 gap-y-1 text-body-sm sm:grid-cols-[11rem_minmax(0,1fr)]">
          <dt className="text-text-secondary">{proposer} gives</dt>
          <dd className="break-words">{terms.gives.join(", ") || "Nothing"}</dd>
          <dt className="text-text-secondary">{owner} gives</dt>
          <dd className="break-words">{terms.gets.join(", ") || "Nothing"}</dd>
          {terms.cash ? (
            <>
              <dt className="text-text-secondary">Cash top-up</dt>
              <dd>
                {nameOf(terms.cash.payer)} pays {formatNaira(terms.cash.amount_naira)}
              </dd>
            </>
          ) : null}
          <dt className="text-text-secondary">Terms version</dt>
          <dd>{terms.number}</dd>
        </dl>
      ) : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-body-sm font-semibold">Handover</h3>
        {agreement.confirmed.length === 0 ? (
          <p className="text-body-sm text-text-secondary">Neither member has confirmed a handover.</p>
        ) : (
          <ul className="flex flex-col gap-0.5 text-body-sm">
            {agreement.confirmed.map((entry) => (
              <li key={entry.role}>
                {nameOf(entry.role)} confirmed {formatRecordTime(entry.confirmed_at)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="text-body-sm font-semibold">{memberName}&apos;s side</h3>
        {agreement.reply ? (
          <blockquote className="rounded-lg bg-bg-subtle p-3 text-body-sm whitespace-pre-line break-words">
            {agreement.reply}
            {agreement.replied_at ? (
              <span className="mt-1 block text-caption text-text-muted">{formatRecordTime(agreement.replied_at)}</span>
            ) : null}
          </blockquote>
        ) : (
          <p className="text-body-sm text-text-secondary">They haven&apos;t added their side.</p>
        )}
      </div>
      <details className="text-body-sm">
        <summary className="inline-flex h-11 cursor-pointer items-center font-semibold text-accent-primary">Agreement record</summary>
        <ol className="flex flex-col gap-1 border-l border-border-default pl-3">
          {agreement.events.map((event, index) => (
            <li key={`${event.created_at}-${String(index)}`}>
              <span className="text-text-muted">{formatRecordTime(event.created_at)}</span> · {event.by ? `${nameOf(event.by)}: ` : ""}
              {EVENT_LABELS[event.action] ?? event.action}
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
