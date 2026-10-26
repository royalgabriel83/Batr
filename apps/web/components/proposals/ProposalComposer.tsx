"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState } from "react";
import { Check, PackageOpen, Plus, X } from "lucide-react";
import {
  CounterProposalInputSchema,
  CreateProposalInputSchema,
  ITEM_MESSAGES,
  PROPOSAL_LIMITS,
  ProposeChangeInputSchema,
  checkInput,
  differsMaterially,
  formatNaira,
  type CashPayer,
  type ComparableTerms,
  type TermsItemInput,
} from "@batr/shared";
import { ExchangeBuilder } from "@/components/offers/ExchangeBuilder";
import {
  Button,
  FormAlert,
  SegmentedControl,
  TextField,
  Textarea,
  toast,
} from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { apiRequest } from "@/lib/offers/api-client";
import {
  cashLabel,
  itemsSentence,
  type ItemView,
  type Role,
} from "@/lib/proposals/terms";
import { TermsPair } from "./TermsPair";

export interface OfferOption {
  id: string;
  title: string;
  thumb_url: string | null;
}

export interface ComposerStart {
  /** Offers on the proposer's side. */
  proposerOffers: string[];
  proposerTexts: string[];
  /** Described extras on the owner's side; the offer itself is always there. */
  ownerTexts: string[];
  cash: { amount_naira: number; payer: CashPayer } | null;
  note: string;
}

export interface ProposalComposerProps {
  /** Propose, counter a proposal, or propose a change to an agreement (Milestone 4). */
  mode: "create" | "counter" | "change";
  viewerRole: Role;
  otherName: string;
  /** The offer being proposed on: always on the owner's side. */
  target: OfferOption;
  /** What the proposer can give: their active offers (plus, in a counter, offers already in the terms). */
  choices: OfferOption[];
  start?: ComposerStart;
  /** Counter only. */
  proposalId?: string;
  expectedRevision?: number;
  /** Change only. */
  agreementId?: string;
  /** Change only: the binding version's number. */
  expectedVersion?: number;
  /** The latest (or agreed) terms, to refuse new terms that change only the note. */
  previous?: ComparableTerms;
  /** An item changed since the latest terms: the same items are new terms. */
  refreshing?: boolean;
}

type Errors = Partial<
  Record<"proposer" | "owner" | "cash" | "note" | "form", string>
>;
type ErrorBody = {
  code: string;
  message: string;
  fields?: Record<string, string>;
  reason?: string;
  proposal_id?: string;
};

const { itemsPerSideMax, noteMax, textItemMax } = PROPOSAL_LIMITS;
const EMPTY: ComposerStart = {
  proposerOffers: [],
  proposerTexts: [],
  ownerTexts: [],
  cash: null,
  note: "",
};

const SENT = {
  create: "Proposal sent",
  counter: "Counter sent",
  change: "Change sent",
} as const;
const SEND_LABEL = {
  create: "Send proposal",
  counter: "Send counter",
  change: "Send change",
} as const;

/** "20,000" or "20000" → 20000; anything else → NaN. */
const parseNaira = (value: string) =>
  /^\s*[\d,]+\s*$/.test(value)
    ? Number(value.replace(/[,\s]/g, ""))
    : Number.NaN;

/**
 * The composer (specs/milestone-3.md, unit 15; user journey 2): what
 * the viewer gives and gets, optional cash and a note, with the
 * exchange builder showing both sides come together, then a review
 * step that restates the terms before sending. Used to propose and,
 * prefilled with the latest terms, to counter; prefilled with the agreed
 * terms, to propose a change to an agreement (specs/milestone-4.md).
 */
export function ProposalComposer({
  mode,
  viewerRole,
  otherName,
  target,
  choices,
  start = EMPTY,
  proposalId,
  expectedRevision,
  agreementId,
  expectedVersion,
  previous,
  refreshing,
}: ProposalComposerProps) {
  const router = useRouter();
  const id = useId();
  const [proposerOffers, setProposerOffers] = useState(start.proposerOffers);
  const [proposerTexts, setProposerTexts] = useState(start.proposerTexts);
  const [ownerTexts, setOwnerTexts] = useState(start.ownerTexts);
  const [cashChoice, setCashChoice] = useState<"none" | CashPayer>(
    start.cash?.payer ?? "none",
  );
  const [cashAmount, setCashAmount] = useState(
    start.cash ? String(start.cash.amount_naira) : "",
  );
  const [note, setNote] = useState(start.note);
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [errors, setErrors] = useState<Errors>({});
  const [failure, setFailure] = useState<ErrorBody | null>(null);
  const [busy, setBusy] = useState(false);
  const attemptKey = useRef<string | null>(null);

  const isProposer = viewerRole === "proposer";
  const byId = useMemo(
    () => new Map(choices.map((offer) => [offer.id, offer])),
    [choices],
  );
  const proposerCount = proposerOffers.length + proposerTexts.length;
  const ownerCount = 1 + ownerTexts.length;

  const terms = () => {
    const gives: TermsItemInput[] = [
      ...proposerOffers.map((offerId) => ({
        kind: "offer" as const,
        offer_id: offerId as never,
      })),
      ...proposerTexts.map((description) => ({
        kind: "text" as const,
        description,
      })),
    ];
    const gets: TermsItemInput[] = [
      { kind: "offer" as const, offer_id: target.id as never },
      ...ownerTexts.map((description) => ({
        kind: "text" as const,
        description,
      })),
    ];
    const cash =
      cashChoice === "none"
        ? null
        : { amount_naira: parseNaira(cashAmount), payer: cashChoice };
    return { gives, gets, cash, note };
  };

  // What each side reads as, for the builder and the review.
  const asItem = (offer: OfferOption): ItemView => ({
    kind: "offer",
    offer_id: offer.id,
    content_version: 0,
    changed: false,
    snapshot: {
      title: offer.title,
      description: "",
      condition: null,
      category: null,
      offering_text: "",
      wants_text: "",
      photo: offer.thumb_url
        ? {
            width: 1,
            height: 1,
            alt_text: "",
            url: null,
            thumb_url: offer.thumb_url,
          }
        : null,
    },
  });
  const texts = (list: string[]) =>
    list
      .filter((text) => text.trim())
      .map(
        (description): ItemView => ({
          kind: "text",
          description: description.trim(),
        }),
      );
  const proposerItems = [
    ...proposerOffers.flatMap((offerId) =>
      byId.get(offerId) ? [asItem(byId.get(offerId) as OfferOption)] : [],
    ),
    ...texts(proposerTexts),
  ];
  const ownerItems = [asItem(target), ...texts(ownerTexts)];
  const give = isProposer ? proposerItems : ownerItems;
  const get = isProposer ? ownerItems : proposerItems;
  const amount = parseNaira(cashAmount);
  const cashText =
    cashChoice === "none" || !Number.isFinite(amount) || amount <= 0
      ? null
      : cashLabel(
          { amount_naira: amount, payer: cashChoice },
          viewerRole,
          otherName,
        );
  const firstPhoto = give.find(
    (item) => item.kind === "offer" && item.snapshot.photo?.thumb_url,
  );

  function review() {
    const input = terms();
    const checked =
      mode === "create"
        ? checkInput(CreateProposalInputSchema, {
            offer_id: target.id,
            ...input,
          })
        : mode === "counter"
          ? checkInput(CounterProposalInputSchema, {
              expected_revision: expectedRevision,
              ...input,
            })
          : checkInput(ProposeChangeInputSchema, {
              expected_version: expectedVersion,
              ...input,
            });
    const next: Errors = {};
    if (!checked.ok) {
      if (checked.errors.gives) next.proposer = checked.errors.gives;
      if (checked.errors.gets) next.owner = checked.errors.gets;
      if (checked.errors.cash)
        next.cash =
          cashChoice !== "none" && !Number.isFinite(amount)
            ? ITEM_MESSAGES.cashWhole
            : checked.errors.cash;
      if (checked.errors.note) next.note = checked.errors.note;
      if (Object.keys(next).length === 0)
        next.form = "Some details need fixing.";
    } else if (
      mode !== "create" &&
      previous &&
      !refreshing &&
      !differsMaterially(previous, checked.data)
    ) {
      next.form =
        "Change an item or the cash. A new note alone isn't new terms.";
    }
    setErrors(next);
    setFailure(null);
    if (Object.keys(next).length > 0) return;
    attemptKey.current ??= crypto.randomUUID();
    setStep("review");
  }

  function backToEdit() {
    attemptKey.current = null;
    setStep("edit");
  }

  async function send() {
    setBusy(true);
    setFailure(null);
    const input = terms();
    const result =
      mode === "create"
        ? await apiRequest<{ id: string }>("/api/v1/proposals", {
            method: "POST",
            json: { offer_id: target.id, ...input },
            idempotencyKey: attemptKey.current ?? undefined,
          })
        : mode === "counter"
          ? await apiRequest<{ id: string }>(
              `/api/v1/proposals/${proposalId ?? ""}/counter`,
              {
                method: "POST",
                json: { expected_revision: expectedRevision, ...input },
                idempotencyKey: attemptKey.current ?? undefined,
              },
            )
          : await apiRequest<{ id: string }>(
              `/api/v1/agreements/${agreementId ?? ""}/changes`,
              {
                method: "POST",
                json: { expected_version: expectedVersion, ...input },
                idempotencyKey: attemptKey.current ?? undefined,
              },
            );
    setBusy(false);
    if (result.ok) {
      toast({ text: SENT[mode] });
      router.push(
        mode === "change"
          ? `/agreements/${result.data.id}`
          : `/exchanges/${result.data.id}`,
      );
      router.refresh();
      return;
    }
    const error = result.error as ErrorBody;
    if ((error.code === "VALIDATION_FAILED" || error.code === "CONTACT_DETAILS") && error.fields) {
      const fields = error.fields;
      setErrors({
        proposer: fields.gives,
        owner: fields.gets,
        cash: fields.cash,
        note: fields.note,
        form: fields.terms ?? "Some details need fixing.",
      });
      backToEdit();
      return;
    }
    // Anything else: the terms stay as they are, ready to retry.
    setFailure(error);
  }

  const proposerEditor = (
    <ProposerSide
      id={`${id}-proposer`}
      legend={isProposer ? "You give" : "You get"}
      offersLegend={
        isProposer ? "Your active offers" : `${otherName}'s active offers`
      }
      emptyOffers={
        isProposer
          ? "You have no active offers. Describe what you'll give instead, or create an offer first."
          : `${otherName} has no other active offers.`
      }
      choices={choices}
      offers={proposerOffers}
      onOffers={setProposerOffers}
      texts={proposerTexts}
      onTexts={setProposerTexts}
      full={proposerCount >= itemsPerSideMax}
      error={errors.proposer}
    />
  );
  const ownerEditor = (
    <OwnerSide
      id={`${id}-owner`}
      legend={isProposer ? "You get" : "You give"}
      target={target}
      texts={ownerTexts}
      onTexts={setOwnerTexts}
      full={ownerCount >= itemsPerSideMax}
      error={errors.owner}
    />
  );

  if (step === "review") {
    return (
      <section aria-labelledby={`${id}-review`} className="flex flex-col gap-5">
        <h2 id={`${id}-review`} className="text-h3">
          Check the terms
        </h2>
        <p className="text-body text-text-secondary">
          {mode === "create"
            ? `${otherName} will see exactly these terms.`
            : mode === "counter"
              ? `These replace the latest terms. ${otherName} can accept, counter or decline.`
              : `The agreed terms stay in place until ${otherName} accepts these.`}
        </p>
        <TermsPair give={give} get={get} cash={cashText} />
        {note.trim() ? (
          <div className="rounded-lg bg-bg-subtle p-3">
            <p className="text-caption font-semibold text-text-muted">
              Your note
            </p>
            <p className="text-body-sm whitespace-pre-line break-words">
              {note.trim()}
            </p>
          </div>
        ) : null}
        {failure ? (
          <SendFailure
            error={failure}
            latestHref={
              mode === "change"
                ? `/agreements/${agreementId ?? ""}`
                : proposalId
                  ? `/exchanges/${proposalId}`
                  : undefined
            }
          />
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void send()} loading={busy}>
            {SEND_LABEL[mode]}
          </Button>
          <Button variant="secondary" onClick={backToEdit} disabled={busy}>
            Edit terms
          </Button>
        </div>
      </section>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        review();
      }}
      className="flex flex-col gap-6"
    >
      {errors.form ? <FormAlert tone="danger">{errors.form}</FormAlert> : null}
      <ExchangeBuilder
        offering={itemsSentence(give)}
        wants={itemsSentence(get)}
        photo={
          firstPhoto?.kind === "offer"
            ? firstPhoto.snapshot.photo?.thumb_url
            : null
        }
        cash={cashText}
      />
      {isProposer ? (
        <>
          {proposerEditor}
          {ownerEditor}
        </>
      ) : (
        <>
          {ownerEditor}
          {proposerEditor}
        </>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-h3">Cash (optional)</legend>
        <p className="text-body-sm text-text-secondary">
          BATR records the amount only. No money moves through BATR.
        </p>
        <SegmentedControl
          name={`${id}-cash`}
          legend="Who pays cash?"
          value={cashChoice}
          onChange={(event) =>
            setCashChoice(event.target.value as "none" | CashPayer)
          }
          options={[
            { value: "none", label: "No cash" },
            { value: viewerRole, label: "You pay" },
            {
              value: viewerRole === "proposer" ? "owner" : "proposer",
              label: `${otherName} pays`,
            },
          ]}
        />
        {cashChoice !== "none" ? (
          <TextField
            id={`${id}-amount`}
            label="Amount in naira"
            inputMode="numeric"
            autoComplete="off"
            value={cashAmount}
            onChange={(event) => setCashAmount(event.target.value)}
            helper={`Whole naira, from ${formatNaira(PROPOSAL_LIMITS.cashNairaMin)} to ${formatNaira(PROPOSAL_LIMITS.cashNairaMax)}.`}
            error={errors.cash}
            className="max-w-xs"
          />
        ) : null}
      </fieldset>

      <Textarea
        id={`${id}-note`}
        label="Note (optional)"
        helper="A short message with these terms. It isn't part of the terms."
        maxLength={noteMax}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        error={errors.note}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit">Review terms</Button>
      </div>
    </form>
  );
}

function ProposerSide({
  id,
  legend,
  offersLegend,
  emptyOffers,
  choices,
  offers,
  onOffers,
  texts,
  onTexts,
  full,
  error,
}: {
  id: string;
  legend: string;
  offersLegend: string;
  emptyOffers: string;
  choices: OfferOption[];
  offers: string[];
  onOffers: (value: string[]) => void;
  texts: string[];
  onTexts: (value: string[]) => void;
  full: boolean;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col gap-3 rounded-xl bg-bg-surface p-4 shadow-card ring-1 ring-border-default/70"
    >
      <legend className="sr-only">{legend}</legend>
      <p aria-hidden="true" className="text-h3">
        {legend}
      </p>
      <p className="text-body-sm text-text-secondary">
        Up to {itemsPerSideMax} items: offers, described items, or both.
      </p>
      <div className="flex flex-col gap-2">
        <p className="text-body-sm font-semibold">{offersLegend}</p>
        {choices.length === 0 ? (
          <p className="text-body-sm text-text-secondary">{emptyOffers}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {choices.map((offer) => {
              const checked = offers.includes(offer.id);
              const inputId = `${id}-${offer.id}`;
              return (
                <li key={offer.id}>
                  <input
                    type="checkbox"
                    id={inputId}
                    className="peer sr-only"
                    checked={checked}
                    disabled={!checked && full}
                    onChange={() =>
                      onOffers(
                        checked
                          ? offers.filter((value) => value !== offer.id)
                          : [...offers, offer.id],
                      )
                    }
                  />
                  <label
                    htmlFor={inputId}
                    className={cx(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border bg-bg-surface p-2 pr-3",
                      "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus-ring",
                      checked
                        ? "border-2 border-accent-primary bg-accent-soft"
                        : "border-border-strong",
                      !checked && full && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-bg-subtle">
                      {offer.thumb_url ? (
                        <Image
                          src={offer.thumb_url}
                          alt=""
                          fill
                          unoptimized
                          sizes="40px"
                          className="object-cover"
                        />
                      ) : (
                        <PackageOpen
                          aria-hidden="true"
                          className="absolute inset-0 m-auto size-4 text-text-muted"
                        />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 text-body-sm font-medium break-words">
                      {offer.title}
                    </span>
                    <span
                      aria-hidden="true"
                      className={cx(
                        "flex size-5 shrink-0 items-center justify-center rounded-sm border",
                        checked
                          ? "border-accent-primary bg-accent-primary text-text-on-accent"
                          : "border-border-strong",
                      )}
                    >
                      {checked ? <Check className="size-3.5" /> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <DescribedItems
        id={`${id}-text`}
        texts={texts}
        onTexts={onTexts}
        full={full}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-body-sm text-state-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function OwnerSide({
  id,
  legend,
  target,
  texts,
  onTexts,
  full,
  error,
}: {
  id: string;
  legend: string;
  target: OfferOption;
  texts: string[];
  onTexts: (value: string[]) => void;
  full: boolean;
  error?: string;
}) {
  const errorId = `${id}-error`;
  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col gap-3 rounded-xl bg-accent-soft p-4"
    >
      <legend className="sr-only">{legend}</legend>
      <p aria-hidden="true" className="text-h3">
        {legend}
      </p>
      <div className="flex items-center gap-3 rounded-lg bg-bg-surface p-2 pr-3">
        <span className="relative size-10 shrink-0 overflow-hidden rounded-md bg-bg-subtle">
          {target.thumb_url ? (
            <Image
              src={target.thumb_url}
              alt=""
              fill
              unoptimized
              sizes="40px"
              className="object-cover"
            />
          ) : null}
        </span>
        <span className="min-w-0 flex-1 text-body-sm font-medium break-words">
          {target.title}
        </span>
        <span className="text-caption text-text-secondary">This offer</span>
      </div>
      <DescribedItems
        id={`${id}-text`}
        texts={texts}
        onTexts={onTexts}
        full={full}
        extras
      />
      {error ? (
        <p id={errorId} role="alert" className="text-body-sm text-state-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

function DescribedItems({
  id,
  texts,
  onTexts,
  full,
  extras,
}: {
  id: string;
  texts: string[];
  onTexts: (value: string[]) => void;
  full: boolean;
  extras?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {texts.map((text, index) => (
        <div key={index} className="flex items-end gap-2">
          <TextField
            id={`${id}-${String(index)}`}
            label={`Described item ${String(index + 1)}`}
            value={text}
            maxLength={textItemMax}
            onChange={(event) =>
              onTexts(
                texts.map((value, i) =>
                  i === index ? event.target.value : value,
                ),
              )
            }
            className="min-w-0 flex-1"
          />
          <button
            type="button"
            onClick={() => onTexts(texts.filter((_, i) => i !== index))}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-bg-subtle hover:text-text-primary"
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">Remove described item {index + 1}</span>
          </button>
        </div>
      ))}
      {full ? null : (
        <button
          type="button"
          onClick={() => onTexts([...texts, ""])}
          className="inline-flex h-11 items-center gap-2 self-start rounded-full px-1 text-body-sm font-semibold text-accent-primary hover:underline"
        >
          <Plus aria-hidden="true" className="size-4" />
          {extras ? "Add something extra, in words" : "Describe an item"}
        </button>
      )}
    </div>
  );
}

function SendFailure({
  error,
  latestHref,
}: {
  error: ErrorBody;
  latestHref?: string;
}) {
  const existing =
    error.reason === "already_open" ? error.proposal_id : undefined;
  const stale = error.code === "CONFLICT" && error.reason !== "already_open";
  return (
    <FormAlert tone="danger">
      <p>{error.message} Your terms are kept here.</p>
      {existing ? (
        <Link
          href={`/exchanges/${existing}`}
          className="font-semibold text-accent-primary underline"
        >
          Open your proposal
        </Link>
      ) : stale && latestHref ? (
        <Link
          href={latestHref}
          className="font-semibold text-accent-primary underline"
        >
          See the latest terms
        </Link>
      ) : null}
    </FormAlert>
  );
}
