"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  COMPONENT_KINDS,
  EXCHANGE_TYPES,
  VALUATION_LIMITS,
  ValuationDraftSchema,
  calculatePlatformFee,
  detailFieldsFor,
  formatKobo,
  parseNaira,
  submitProblems,
  type ComponentKind,
  type ExchangeType,
  type ValuationDraft,
} from "@batr/shared";
import { Button, FormAlert, SegmentedControl, TextField, Textarea } from "@/components/ui";
import { EvidenceList } from "@/components/valuation/EvidenceList";
import { koboToInput } from "@/lib/valuation/format";
import { keyedRequest } from "@/lib/valuation/client";
import type { MemberValuation } from "@/lib/valuation/types";
import { ComponentEditor, type ComponentDraft } from "./ComponentEditor";

interface FormState {
  exchange_type: ExchangeType;
  cash: string;
  components: ComponentDraft[];
}

function fromValuation(v: MemberValuation): FormState {
  return {
    exchange_type: v.exchange_type,
    cash: v.cash_component_kobo ? koboToInput(v.cash_component_kobo) : "",
    components: v.components.map((c) => ({
      id: c.id,
      kind: c.kind,
      category: c.category ?? "",
      subcategory: c.subcategory,
      description: c.description,
      quantity: String(c.quantity),
      unit: c.unit,
      proposed: koboToInput(c.proposed_value_kobo),
      details: Object.fromEntries(
        Object.entries(c.details).map(([key, value]) => {
          const field = detailFieldsFor(c.kind).find((f) => f.key === key);
          if (typeof value === "boolean") return [key, value];
          return [key, field?.type === "kobo" && typeof value === "number" ? koboToInput(value) : String(value)];
        }),
      ),
    })),
  };
}

const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : text);

/** The form as the API's draft. Text that isn't a valid amount is passed on so the schema reports it. */
function toDraft(state: FormState): unknown {
  return {
    exchange_type: state.exchange_type,
    cash_component_kobo: state.cash.trim() === "" ? 0 : (parseNaira(state.cash) ?? -1),
    components: state.components.map((c) => ({
      id: c.id,
      kind: c.kind,
      category: c.category || null,
      subcategory: c.subcategory,
      description: c.description,
      quantity: whole(c.quantity),
      unit: c.unit,
      proposed_value_kobo: c.proposed.trim() === "" ? null : (parseNaira(c.proposed) ?? -1),
      details: Object.fromEntries(
        Object.entries(c.details).map(([key, value]) => {
          if (typeof value === "boolean") return [key, value];
          const type = detailFieldsFor(c.kind).find((f) => f.key === key)?.type;
          if (type === "integer") return [key, value.trim() === "" ? "" : whole(value)];
          if (type === "kobo") return [key, value.trim() === "" ? "" : (parseNaira(value) ?? -1)];
          return [key, value];
        }),
      ),
    })),
  };
}

/** Zod issues as form keys: top-level fields, or `{itemId}.{field}`. */
function draftErrors(state: FormState): { draft: ValuationDraft | null; errors: Record<string, string> } {
  const parsed = ValuationDraftSchema.safeParse(toDraft(state));
  if (parsed.success) return { draft: parsed.data, errors: {} };
  const errors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const [top, index, field, key] = issue.path;
    if (top === "components" && typeof index === "number") {
      const id = state.components[index]?.id ?? "";
      const name = field === "details" ? String(key) : String(field ?? "description");
      errors[`${id}.${name}`] ??= issue.message;
    } else errors[String(top ?? "draft")] ??= issue.message;
  }
  return { draft: null, errors };
}

export interface ValuationFormProps {
  valuation: MemberValuation;
  onChange: (valuation: MemberValuation) => void;
}

/**
 * The valuation form (owner, 2026-10-17): the exchange type, any cash,
 * and each item with its category-specific questions and evidence.
 * Saving keeps a draft; sending needs every required answer, at least
 * two photos of each physical item, and the accuracy declaration.
 */
export function ValuationForm({ valuation, onChange }: ValuationFormProps) {
  const [state, setState] = useState<FormState>(() => fromValuation(valuation));
  const [saved, setSaved] = useState<string>(() => JSON.stringify(fromValuation(valuation)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [declared, setDeclared] = useState(false);
  const [note, setNote] = useState("");
  const [send] = useState(keyedRequest);
  const current = useRef(valuation);
  const dirty = JSON.stringify(state) !== saved;
  const openRequest = valuation.requests.find((r) => r.responded_at === null);
  // A repeat of a valuation BATR already decided needs new evidence or a material change, and a note saying what's new.
  const repeat = valuation.status === "draft" ? valuation.repeat_of : null;
  const cashOnly = state.exchange_type === "cash_only";

  function accept(next: MemberValuation, keepForm = false) {
    current.current = next;
    onChange(next);
    if (!keepForm) {
      const fresh = fromValuation(next);
      setState(fresh);
      setSaved(JSON.stringify(fresh));
    }
  }

  async function save(): Promise<boolean> {
    const { draft, errors: found } = draftErrors(state);
    setErrors(found);
    if (!draft) {
      setAlert({ tone: "danger", text: "Some details need fixing." });
      return false;
    }
    setBusy("save");
    const result = await send<MemberValuation>("save", `/api/v1/valuations/${valuation.id}`, "PATCH", {
      expected_revision: current.current.revision,
      draft,
    });
    setBusy(null);
    if (!result.ok) {
      setErrors(result.error.fields ?? {});
      setAlert({ tone: "danger", text: result.error.message });
      return false;
    }
    accept(result.data);
    return true;
  }

  async function ensureSaved(): Promise<boolean> {
    return dirty ? save() : true;
  }

  async function submit() {
    setAlert(null);
    const { draft, errors: found } = draftErrors(state);
    const problems = draft ? submitProblems(draft, current.current.evidence) : {};
    if (!declared) problems.declaration = "Confirm that the information is accurate.";
    if (repeat && note.trim().length < 20) problems.note = "Tell BATR what's new since the earlier valuation, in at least 20 characters.";
    const all = { ...found, ...problems };
    setErrors(all);
    if (Object.keys(all).length > 0) {
      setAlert({ tone: "danger", text: "Some details are missing. Check the highlighted answers." });
      return;
    }
    if (dirty && !(await save())) return;
    setBusy("submit");
    const result = await send<MemberValuation>("submit", `/api/v1/valuations/${valuation.id}/submit`, "POST", {
      expected_revision: current.current.revision,
      declaration: true,
      note,
    });
    setBusy(null);
    if (!result.ok) {
      setErrors(result.error.fields ?? {});
      setAlert({ tone: "danger", text: result.error.message });
      return;
    }
    accept(result.data);
  }

  function addComponent(kind: ComponentKind) {
    setState((s) => ({
      ...s,
      components: [
        ...s.components,
        { id: crypto.randomUUID(), kind, category: "", subcategory: "", description: "", quantity: "1", unit: "", proposed: "", details: {} },
      ],
    }));
  }

  // A preview of the fee on the member's own proposed values; BATR's assessment decides the real one.
  const proposedTotal = state.components.reduce((sum, c) => sum + (parseNaira(c.proposed) ?? 0), 0);
  const cashKobo = parseNaira(state.cash) ?? 0;
  let preview: ReturnType<typeof calculatePlatformFee> | null = null;
  try {
    preview = calculatePlatformFee({ exchangeType: state.exchange_type, assessedNonCash: cashOnly ? 0 : proposedTotal, agreedCash: state.exchange_type === "pure_barter" ? 0 : cashKobo });
  } catch {
    preview = null;
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {openRequest ? (
        <FormAlert tone="info">
          <span className="font-semibold">BATR asked for more information:</span> {openRequest.message}
        </FormAlert>
      ) : null}

      <section aria-labelledby="exchange-heading" className="flex flex-col gap-4 rounded-xl bg-bg-surface p-5 shadow-card ring-1 ring-border-default/70 md:p-6">
        <h2 id="exchange-heading" className="text-h3 tracking-tight">
          The exchange
        </h2>
        <SegmentedControl
          name="exchange_type"
          legend="Type of exchange"
          options={Object.entries(EXCHANGE_TYPES).map(([value, label]) => ({ value, label }))}
          value={state.exchange_type}
          onChange={(e) => setState((s) => ({ ...s, exchange_type: e.target.value as ExchangeType }))}
          error={errors.exchange_type}
        />
        <p className="text-body-sm text-text-secondary">
          {state.exchange_type === "pure_barter"
            ? "Goods, services or skills only. No cash changes hands."
            : state.exchange_type === "cash_plus_barter"
              ? "Goods, services or skills, plus some cash to balance the exchange."
              : "Only cash is paid for this offer. There is nothing to assess, so BATR quotes the fee on the agreed cash."}
        </p>
        {state.exchange_type !== "pure_barter" ? (
          <TextField
            id="cash"
            inputMode="decimal"
            label={cashOnly ? "Agreed cash (₦)" : "Cash on top (₦)"}
            helper="Paid between the members, not to BATR."
            value={state.cash}
            error={errors.cash_component_kobo}
            onChange={(e) => setState((s) => ({ ...s, cash: e.target.value }))}
            className="max-w-xs"
          />
        ) : null}
      </section>

      {!cashOnly ? (
        <>
          {state.components.map((component, index) => (
            <ComponentEditor
              key={component.id}
              index={index}
              component={component}
              valuation={valuation}
              errors={errors}
              onChange={(next) => setState((s) => ({ ...s, components: s.components.map((c) => (c.id === next.id ? next : c)) }))}
              onRemove={() => setState((s) => ({ ...s, components: s.components.filter((c) => c.id !== component.id) }))}
              onValuation={(next) => accept(next, true)}
              ensureSaved={ensureSaved}
            />
          ))}
          {errors.components ? <FormAlert tone="danger">{errors.components}</FormAlert> : null}
          {state.components.length < VALUATION_LIMITS.componentsMax ? (
            <div className="flex flex-wrap gap-2">
              {(Object.keys(COMPONENT_KINDS) as ComponentKind[]).map((kind) => (
                <Button key={kind} variant="secondary" size="sm" icon={<Plus aria-hidden="true" />} onClick={() => addComponent(kind)}>
                  Add {COMPONENT_KINDS[kind].toLowerCase()}
                </Button>
              ))}
            </div>
          ) : null}
          <section className="rounded-xl bg-bg-surface p-5 shadow-card ring-1 ring-border-default/70 md:p-6">
            <EvidenceList
              valuationId={valuation.id}
              label="Other supporting documents (optional)"
              hint="Anything that applies to the whole exchange."
              items={valuation.evidence.filter((e) => e.component_id === null)}
              kinds={["supporting_document", "invoice", "receipt"]}
              beforeUpload={ensureSaved}
              onChange={(next) => accept(next, true)}
              removable={valuation.status === "draft" && valuation.submitted_at === null}
            />
          </section>
        </>
      ) : null}

      {preview ? (
        <p className="rounded-lg bg-accent-soft px-4 py-3 text-body-sm text-text-primary">
          On the values you propose, the 3% platform fee would be <span className="font-semibold">{formatKobo(preview.totalFee)}</span>, half each (
          {formatKobo(preview.partyAShare)} for you). BATR&apos;s assessment sets the real amount.
        </p>
      ) : null}

      <section aria-labelledby="send-heading" className="flex flex-col gap-4 rounded-xl bg-bg-surface p-5 shadow-card ring-1 ring-border-default/70 md:p-6">
        <h2 id="send-heading" className="text-h3 tracking-tight">
          {openRequest ? "Send it back" : "Send for review"}
        </h2>
        {repeat ? (
          <FormAlert tone="info">
            BATR has already decided a valuation of this item{repeat.same_offer ? "" : " on another of your offers"}
            {repeat.final ? ", and that decision is final" : ""}. To send a new one, add new evidence or change the details, and tell BATR
            what&apos;s new. Changing only the value you propose doesn&apos;t count.
          </FormAlert>
        ) : null}
        {openRequest || repeat ? (
          <Textarea
            id="note"
            label={repeat ? "What's new since the earlier valuation" : "Note to BATR (optional)"}
            rows={3}
            maxLength={2000}
            value={note}
            error={errors.note}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="declaration" className="flex items-start gap-3 text-body-sm">
            <input
              id="declaration"
              type="checkbox"
              checked={declared}
              onChange={(e) => setDeclared(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-accent-primary"
              aria-describedby={errors.declaration ? "declaration-error" : undefined}
            />
            <span>
              The information and evidence I&apos;ve given are accurate and complete, I&apos;ve disclosed every defect I know of, and the photos
              show the actual item.
            </span>
          </label>
          {errors.declaration ? (
            <p id="declaration-error" className="pl-8 text-body-sm text-state-danger">
              {errors.declaration}
            </p>
          ) : null}
        </div>
        {alert ? <FormAlert tone={alert.tone}>{alert.text}</FormAlert> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={busy === "submit"} disabled={busy !== null}>
            {openRequest ? "Send it back" : "Send for review"}
          </Button>
          <Button variant="secondary" loading={busy === "save"} disabled={busy !== null || !dirty} onClick={() => void save()}>
            {dirty ? "Save draft" : "Saved"}
          </Button>
        </div>
      </section>
    </form>
  );
}
