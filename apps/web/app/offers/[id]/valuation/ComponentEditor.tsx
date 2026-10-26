"use client";

import { Trash2 } from "lucide-react";
import {
  COMPONENT_KINDS,
  DETAIL_ENUMS,
  categoriesFor,
  detailFieldsFor,
  type DetailField,
  type EvidenceKind,
} from "@batr/shared";
import { Button, SegmentedControl, Select, TextField, Textarea } from "@/components/ui";
import { EvidenceList } from "@/components/valuation/EvidenceList";
import type { MemberValuation } from "@/lib/valuation/types";

/** One item as the form holds it: amounts as the text the member typed. */
export interface ComponentDraft {
  id: string;
  kind: "goods" | "service" | "skill";
  category: string;
  subcategory: string;
  description: string;
  quantity: string;
  unit: string;
  proposed: string;
  details: Record<string, string | boolean>;
}

const GOODS_DOCUMENTS: readonly EvidenceKind[] = ["receipt", "invoice", "warranty", "repair_record", "supporting_document"];
const SERVICE_DOCUMENTS: readonly EvidenceKind[] = ["portfolio", "invoice", "supporting_document"];

function DetailInput({
  field,
  idPrefix,
  value,
  error,
  onChange,
}: {
  field: DetailField;
  idPrefix: string;
  value: string | boolean | undefined;
  error?: string;
  onChange: (value: string | boolean) => void;
}) {
  const id = `${idPrefix}-${field.key}`;
  const label = field.label;
  const text = typeof value === "string" ? value : "";
  switch (field.type) {
    case "long_text":
      return <Textarea id={id} label={label} helper={field.hint} error={error} rows={3} maxLength={2000} value={text} onChange={(e) => onChange(e.target.value)} />;
    case "boolean":
      return (
        <SegmentedControl
          name={id}
          legend={label}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ]}
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(e) => onChange(e.target.value === "yes")}
          error={error}
        />
      );
    case "enum":
      return (
        <Select
          id={id}
          label={label}
          helper={field.hint}
          error={error}
          placeholder="Choose"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          options={Object.entries(field.options ? DETAIL_ENUMS[field.options] : {}).map(([v, l]) => ({ value: v, label: l }))}
        />
      );
    case "date":
      return <TextField id={id} type="date" label={label} helper={field.hint} error={error} max={new Date().toISOString().slice(0, 10)} value={text} onChange={(e) => onChange(e.target.value)} />;
    case "integer":
      return <TextField id={id} inputMode="numeric" label={label} helper={field.hint} error={error} value={text} onChange={(e) => onChange(e.target.value)} />;
    case "kobo":
      return <TextField id={id} inputMode="decimal" label={`${label} (₦)`} helper={field.hint} error={error} value={text} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <TextField id={id} label={label} helper={field.hint} error={error} maxLength={200} value={text} onChange={(e) => onChange(e.target.value)} />;
  }
}

export interface ComponentEditorProps {
  index: number;
  component: ComponentDraft;
  valuation: MemberValuation;
  errors: Record<string, string>;
  onChange: (component: ComponentDraft) => void;
  onRemove: () => void;
  onValuation: (valuation: MemberValuation) => void;
  ensureSaved: () => Promise<boolean>;
}

/**
 * One item in the valuation form: its kind, category and the questions
 * for that kind. Required questions come first; the rest are under
 * "More details". Goods also take at least two photos of the actual
 * item, and any documents.
 */
export function ComponentEditor({ index, component, valuation, errors, onChange, onRemove, onValuation, ensureSaved }: ComponentEditorProps) {
  const prefix = `c${String(index)}`;
  const at = (field: string) => errors[`${component.id}.${field}`];
  const fields = detailFieldsFor(component.kind);
  const needed = fields.filter((f) => f.required || f.requiredWhen || f.requiredUnless);
  const optional = fields.filter((f) => !(f.required || f.requiredWhen || f.requiredUnless));
  const visible = needed.filter((f) => !f.requiredWhen || component.details[f.requiredWhen] === true);
  const setDetail = (key: string, value: string | boolean) => onChange({ ...component, details: { ...component.details, [key]: value } });
  const evidence = valuation.evidence.filter((e) => e.component_id === component.id);
  const saved = valuation.components.some((c) => c.id === component.id);
  const removable = valuation.status === "draft" && valuation.submitted_at === null;
  const categories = categoriesFor(component.kind);

  return (
    <section aria-labelledby={`${prefix}-title`} className="flex flex-col gap-5 rounded-xl bg-bg-surface p-5 shadow-card ring-1 ring-border-default/70 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 id={`${prefix}-title`} className="text-h4 tracking-tight">
          {String(index + 1)}. {COMPONENT_KINDS[component.kind]}
        </h3>
        <Button size="sm" variant="tertiary" icon={<Trash2 aria-hidden="true" />} onClick={onRemove} aria-label={`Remove item ${String(index + 1)}`}>
          Remove
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Select
          id={`${prefix}-category`}
          label="Category"
          placeholder="Choose a category"
          value={component.category}
          error={at("category")}
          onChange={(e) => onChange({ ...component, category: e.target.value })}
          options={Object.entries(categories).map(([value, label]) => ({ value, label }))}
        />
        <TextField id={`${prefix}-subcategory`} label="Subcategory (optional)" maxLength={80} value={component.subcategory} onChange={(e) => onChange({ ...component, subcategory: e.target.value })} />
      </div>
      <Textarea
        id={`${prefix}-description`}
        label="Description"
        helper="What it is, in your own words."
        rows={3}
        maxLength={2000}
        value={component.description}
        error={at("description")}
        onChange={(e) => onChange({ ...component, description: e.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField id={`${prefix}-quantity`} inputMode="numeric" label="Quantity" value={component.quantity} error={at("quantity")} onChange={(e) => onChange({ ...component, quantity: e.target.value })} />
        <TextField id={`${prefix}-unit`} label="Unit (optional)" placeholder={component.kind === "goods" ? "piece" : "hour, session"} maxLength={40} value={component.unit} onChange={(e) => onChange({ ...component, unit: e.target.value })} />
        <TextField
          id={`${prefix}-proposed`}
          inputMode="decimal"
          label="Value you propose (₦)"
          value={component.proposed}
          error={at("proposed_value_kobo")}
          onChange={(e) => onChange({ ...component, proposed: e.target.value })}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {visible.map((field) => (
          <div key={field.key} className={field.type === "long_text" ? "md:col-span-2" : undefined}>
            <DetailInput field={field} idPrefix={prefix} value={component.details[field.key]} error={at(field.key)} onChange={(v) => setDetail(field.key, v)} />
          </div>
        ))}
      </div>
      <details className="group rounded-lg border border-border-default px-4 py-3">
        <summary className="cursor-pointer text-body-sm font-semibold text-accent-primary">More details (optional)</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {optional.map((field) => (
            <div key={field.key} className={field.type === "long_text" ? "md:col-span-2" : undefined}>
              <DetailInput field={field} idPrefix={prefix} value={component.details[field.key]} error={at(field.key)} onChange={(v) => setDetail(field.key, v)} />
            </div>
          ))}
        </div>
      </details>
      {component.kind === "goods" ? (
        <EvidenceList
          valuationId={valuation.id}
          label="Photos of the actual item"
          hint="At least 2, from different angles. Show any defects clearly."
          items={evidence.filter((e) => e.kind === "photo")}
          kinds={["photo"]}
          componentId={component.id}
          beforeUpload={ensureSaved}
          onChange={onValuation}
          removable={removable}
          error={at("photos")}
        />
      ) : null}
      <EvidenceList
        valuationId={valuation.id}
        label={component.kind === "goods" ? "Receipts and documents (optional)" : "Portfolio and documents (optional)"}
        hint="Private: only you and BATR reviewers can open these."
        items={evidence.filter((e) => e.kind !== "photo")}
        kinds={component.kind === "goods" ? GOODS_DOCUMENTS : SERVICE_DOCUMENTS}
        componentId={component.id}
        beforeUpload={ensureSaved}
        onChange={onValuation}
        removable={removable}
      />
      {!saved ? <p className="text-caption text-text-muted">Adding a file saves your changes first.</p> : null}
    </section>
  );
}
