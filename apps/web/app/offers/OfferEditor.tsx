"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, LockKeyhole, MapPin, PencilLine } from "lucide-react";
import {
  EMPTY_OFFER_FIELDS,
  OFFER_CATEGORIES,
  OFFER_AREA_IDS,
  OFFER_CONDITIONS,
  OFFER_EXCHANGE_MODES,
  OFFER_HANDOVER_METHODS,
  OFFER_LIMITS,
  OFFER_TYPES,
  areaLabel,
  offerCategoriesFor,
  switchOfferType,
  signInPathFor,
  type FieldErrors,
  type OfferCategory,
  type OfferCondition,
  type OfferExchangeMode,
  type OfferFields,
  type OfferHandoverMethod,
  type OfferType,
} from "@batr/shared";
import { Button, CheckboxGroup, FormAlert, MemberInitial, SegmentedControl, Select, TextField, Textarea } from "@/components/ui";
import { cx } from "@/components/ui/cx";
import { ConfirmDialog } from "@/components/offers/ConfirmDialog";
import { ExchangeBuilder } from "@/components/offers/ExchangeBuilder";
import { ExchangePair } from "@/components/offers/ExchangePair";
import { OfferDetail } from "@/components/offers/OfferDetail";
import { OfferStatusBadge } from "@/components/offers/OfferStatusBadge";
import { apiRequest, newIdempotencyKey, uploadWithProgress } from "@/lib/offers/api-client";
import { clearBackup, saveBackup, takeBackup, type Backup } from "@/lib/offers/draft-backup";
import { guardedDestination } from "@/lib/offers/leave-guard";
import {
  changedFields,
  checkForm,
  conflictDifferences,
  errorMessage,
  fieldsOf,
  filledFields,
  firstInvalidField,
  FORM_STEPS,
  formErrorsFrom,
  hasUnsavedChanges,
  stepErrors,
  stepOf,
  type FormField,
} from "@/lib/offers/editor-state";
import { checkChosenPhoto } from "@/lib/offers/photo-check";
import type { ApiErrorBody, ApiResult, OfferOwner, OwnerOffer } from "@/lib/offers/types";
import { PhotoManager, type PendingPhoto } from "./PhotoManager";

const TYPE_OPTIONS = Object.entries(OFFER_TYPES).map(([value, label]) => ({ value, label }));
const categoryOptions = (type: OfferType) => Object.entries(offerCategoriesFor(type)).map(([value, label]) => ({ value, label }));
const CONDITION_OPTIONS = Object.entries(OFFER_CONDITIONS).map(([value, label]) => ({ value, label }));
const MODE_OPTIONS = Object.entries(OFFER_EXCHANGE_MODES).map(([value, label]) => ({ value, label }));
const AREA_OPTIONS = OFFER_AREA_IDS.map((id) => ({ value: id, label: id === "ibadan" ? "Ibadan (anywhere in the city)" : (areaLabel(id) ?? id) }));

/** The handover choices that fit the offer's type and exchange mode (remote: remote service only; in person: no remote service). */
function methodOptionsFor(type: OfferType, mode: OfferExchangeMode | null) {
  return (Object.entries(OFFER_HANDOVER_METHODS) as [OfferHandoverMethod, (typeof OFFER_HANDOVER_METHODS)[OfferHandoverMethod]][])
    .filter(([, method]) => method.service === (type === "service"))
    .filter(([, method]) => (mode === "remote" ? !method.inPerson : mode === "in_person" ? method.inPerson : true))
    .map(([value, method]) => ({ value, label: method.label }));
}

/** Element that receives focus for each field's error. */
const FOCUS_TARGET: Record<FormField, string> = {
  offer_type: "offer_type-item",
  photos: "photos-add",
  title: "title",
  category: "category",
  condition: "condition-new",
  description: "description",
  offering_text: "offering_text",
  wants_text: "wants_text",
  exchange_mode: "exchange_mode-in_person",
  handover_methods: "handover_methods-collection",
  area: "area",
};

const withoutKey = (errors: FieldErrors, field: keyof FieldErrors): FieldErrors =>
  Object.fromEntries(Object.entries(errors).filter(([key]) => key !== field));

type Alert = { tone: "danger" | "info" | "success"; text: string; details?: string[]; action?: { label: string; run: () => void } } | null;

const LAST_STEP = FORM_STEPS.length - 1;

// Below the `md` breakpoint the form is shown one step at a time.
const COMPACT_QUERY = "(max-width: 767.98px)";
function subscribeCompact(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const useCompactLayout = () =>
  useSyncExternalStore(
    subscribeCompact,
    () => window.matchMedia(COMPACT_QUERY).matches,
    () => false,
  );

/** Focuses the first of these elements that is currently shown. */
function focusFirstShown(ids: string[]) {
  for (const id of ids) {
    const element = document.getElementById(id);
    if (element && element.getClientRects().length > 0) {
      element.focus();
      return;
    }
  }
}
type PendingUpload = PendingPhoto & { file: File; key: string; sent?: { revision: number; status: OwnerOffer["status"] } };

export interface OfferEditorProps {
  initialOffer: OwnerOffer | null;
  /** The member, for the preview's owner line. */
  owner: OfferOwner;
}

/**
 * Create and edit an offer. Every change goes through the offer API
 * (one request at a time, so each carries the revision the previous
 * one returned). A draft is created the first time the member saves or
 * adds a photo; leaving keeps it in My offers. Typing that isn't saved
 * yet is kept in the tab (draft-backup.ts) and the member is asked
 * before a link takes them away from it. On small screens the form is
 * shown in three steps, then the preview.
 */
export function OfferEditor({ initialOffer, owner }: OfferEditorProps) {
  const router = useRouter();
  const [offer, setOffer] = useState<OwnerOffer | null>(initialOffer);
  const [values, setValues] = useState<OfferFields>(initialOffer ? fieldsOf(initialOffer) : EMPTY_OFFER_FIELDS);
  const [errors, setErrors] = useState<FieldErrors>({});
  const service = values.offer_type === "service";
  const [alert, setAlert] = useState<Alert>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [publishing, setPublishing] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [step, setStep] = useState(0);
  const [focusRequest, setFocusRequest] = useState<{ ids: string[] } | null>(null);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const compact = useCompactLayout();

  // Refs give queued operations the latest values without waiting for a render.
  const offerRef = useRef(offer);
  const valuesRef = useRef(values);
  const pendingRef = useRef(pending);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const createKey = useRef(newIdempotencyKey());
  const publishKey = useRef<string | null>(null);
  // Typing kept from an earlier visit: undefined until read, null once applied or when there is none.
  const restore = useRef<Backup | null | undefined>(undefined);
  valuesRef.current = values;

  const saved = offer ? fieldsOf(offer) : null;
  const status = offer?.status ?? null;
  const isDraft = status === null || status === "draft";
  const uploading = pending.some((p) => p.state !== "error");
  const dirty = hasUnsavedChanges(saved, values);
  const offerId = offer?.id ?? null;
  const revision = offer?.revision ?? null;
  const guarded = dirty || uploading;

  // Bring back typing kept from an earlier visit (refresh, Back button,
  // or signing in again). Session storage exists only in the browser,
  // so this runs after the first render.
  useEffect(() => {
    if (restore.current === undefined) restore.current = takeBackup(initialOffer?.id ?? null);
    const kept = restore.current;
    if (!kept) return;
    const timer = setTimeout(() => {
      restore.current = null;
      setValues(kept.values);
      const discard = { label: "Discard restored changes", run: discardRestored };
      const latest = offerRef.current;
      if (latest && kept.revision !== null && kept.revision !== latest.revision) {
        // Saved elsewhere since: same handling as a stale save (milestone-1.md, Concurrency 5).
        setAlert({
          tone: "danger",
          text: errorMessage({ code: "CONFLICT", message: "", reason: "stale_revision" }),
          details: conflictDifferences(kept.values, fieldsOf(latest)).map((d) => `Latest saved ${d.label.toLowerCase()}: ${d.latest}`),
          action: discard,
        });
      } else {
        setAlert({ tone: "info", text: "We restored the changes you hadn't saved. Review them, then save.", action: discard });
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [initialOffer?.id]);

  // Keep unsaved typing in the tab; forget it once everything is saved.
  useEffect(() => {
    if (restore.current) return;
    if (dirty) saveBackup(offerId, values, revision);
    else clearBackup(offerId);
  }, [dirty, values, offerId, revision]);

  // Refresh, closing the tab, or leaving BATR: the browser's own warning.
  useEffect(() => {
    if (!guarded) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [guarded]);

  // Links inside BATR change page without unloading it, so the form asks itself.
  useEffect(() => {
    if (!guarded) return;
    const onClick = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      const destination = guardedDestination(
        event,
        { href: link.href, target: link.target, download: link.hasAttribute("download") },
        new URL(window.location.href),
      );
      if (!destination) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveTo(destination);
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [guarded]);

  useEffect(() => {
    if (focusRequest) focusFirstShown(focusRequest.ids);
  }, [focusRequest]);

  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = queue.current.then(task, task);
    queue.current = run.catch(() => undefined);
    return run;
  }, []);

  function applyOffer(next: OwnerOffer) {
    const created = offerRef.current === null;
    offerRef.current = next;
    setOffer(next);
    if (created) {
      window.history.replaceState(null, "", `/offers/${next.id}/edit`);
      clearBackup(null);
    }
  }

  function discardRestored() {
    const current = offerRef.current;
    clearBackup(current?.id ?? null);
    setValues(current ? fieldsOf(current) : EMPTY_OFFER_FIELDS);
    setErrors({});
    setAlert(null);
  }

  function leaveWithoutSaving() {
    const destination = leaveTo;
    if (!destination) return;
    restore.current = undefined;
    clearBackup(offerRef.current?.id ?? null);
    setLeaveTo(null);
    router.push(destination);
  }

  /** Shows the errors inline, on the step that has the first one, and focuses it. */
  function showFieldErrors(next: FieldErrors) {
    setErrors(next);
    setAlert({ tone: "danger", text: "Some details need fixing." });
    const first = firstInvalidField(next);
    if (!first) return;
    setMode("edit");
    setStep(stepOf(first));
    // A service's handover choices are different checkboxes; focus the first one shown.
    setFocusRequest({ ids: first === "handover_methods" ? Object.keys(OFFER_HANDOVER_METHODS).map((m) => `handover_methods-${m}`) : [FOCUS_TARGET[first]] });
  }

  /** Common handling for a failed request. Returns nothing; the form keeps its input. */
  async function handleFailure(error: ApiErrorBody, statusCode: number) {
    if (statusCode === 401) {
      saveBackup(offerRef.current?.id ?? null, valuesRef.current, offerRef.current?.revision ?? null);
      window.location.assign(signInPathFor(window.location.pathname));
      return;
    }
    if (error.code === "CONFLICT") {
      const latest = error.offer ?? (await refreshOffer());
      if (latest) {
        applyOffer(latest);
        const differences = conflictDifferences(valuesRef.current, fieldsOf(latest));
        setAlert({
          tone: "danger",
          text: errorMessage(error),
          details: differences.map((d) => `Latest saved ${d.label.toLowerCase()}: ${d.latest}`),
        });
      } else {
        setAlert({ tone: "danger", text: "This offer isn't available any more." });
      }
      return;
    }
    const fieldErrors = formErrorsFrom(error);
    if (Object.keys(fieldErrors).length > 0) {
      showFieldErrors(fieldErrors);
      return;
    }
    setAlert({ tone: "danger", text: errorMessage(error) });
  }

  async function refreshOffer(): Promise<OwnerOffer | null> {
    const id = offerRef.current?.id;
    if (!id) return null;
    const result = await apiRequest<OwnerOffer>(`/api/v1/offers/${id}`);
    return result.ok ? result.data : null;
  }

  const expectations = (current: OwnerOffer) => ({ expected_revision: current.revision, expected_status: current.status });

  /** Inside the queue: the offer, creating the draft first if needed. */
  async function ensureDraft(): Promise<OwnerOffer | null> {
    if (offerRef.current) return offerRef.current;
    const result = await apiRequest<OwnerOffer>("/api/v1/offers", {
      method: "POST",
      json: filledFields(valuesRef.current),
      idempotencyKey: createKey.current,
    });
    if (!result.ok) {
      await handleFailure(result.error, result.status);
      return null;
    }
    applyOffer(result.data);
    return result.data;
  }

  /** Inside the queue: saves changed fields. True when everything typed is saved. */
  async function saveFields(): Promise<boolean> {
    if (!offerRef.current) return (await ensureDraft()) !== null;
    const current = offerRef.current;
    const patch = changedFields(fieldsOf(current), valuesRef.current);
    if (Object.keys(patch).length === 0) return true;
    const result = await apiRequest<OwnerOffer>(`/api/v1/offers/${current.id}`, {
      method: "PATCH",
      json: { ...expectations(current), fields: patch },
      idempotencyKey: newIdempotencyKey(),
    });
    if (!result.ok) {
      await handleFailure(result.error, result.status);
      return false;
    }
    applyOffer(result.data);
    return true;
  }

  /** Switching type clears a category, condition and handover methods that don't fit the new type. */
  function chooseType(type: OfferType) {
    setValues((current) => switchOfferType(current, type));
    setSaveState("idle");
    setErrors((current) => withoutKey(withoutKey(withoutKey(withoutKey(current, "offer_type"), "category"), "condition"), "handover_methods"));
  }

  function setField<K extends keyof OfferFields>(field: K, value: OfferFields[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setSaveState("idle");
    if (errors[field]) setErrors((current) => withoutKey(current, field));
  }

  async function save() {
    const problems = checkForm(status, "save", values, offer?.photos.length ?? 0);
    if (Object.keys(problems).length > 0) {
      showFieldErrors(problems);
      return;
    }
    setAlert(null);
    setSaveState("saving");
    const ok = await enqueue(saveFields);
    setSaveState(ok ? "saved" : "idle");
    if (ok) setErrors({});
  }

  /** Small screens: checks this step's fields, saves a draft, then moves on. */
  async function nextStep() {
    const problems = stepErrors(checkForm(status, "save", values, offer?.photos.length ?? 0), step);
    if (Object.keys(problems).length > 0) {
      showFieldErrors(problems);
      return;
    }
    // Leaving at any step keeps a draft (02-offer-creation.md, journey step 7).
    if (isDraft && dirty) {
      setSaveState("saving");
      const ok = await enqueue(saveFields);
      setSaveState(ok ? "saved" : "idle");
      if (!ok) return;
    }
    setErrors({});
    if (alert?.tone === "danger") setAlert(null);
    if (step === LAST_STEP) {
      setMode("preview");
      setFocusRequest({ ids: ["preview-heading"] });
    } else {
      setStep(step + 1);
      setFocusRequest({ ids: ["step-status"] });
    }
  }

  function previousStep() {
    setStep(Math.max(step - 1, 0));
    setFocusRequest({ ids: ["step-status"] });
  }

  async function publish() {
    if (publishing) return;
    if (uploading) {
      setAlert({ tone: "info", text: "Wait for your photos to finish uploading, then publish." });
      return;
    }
    const problems = checkForm(status, "publish", values, offer?.photos.length ?? 0);
    if (Object.keys(problems).length > 0) {
      showFieldErrors(problems);
      return;
    }
    setAlert(null);
    setPublishing(true);
    publishKey.current ??= newIdempotencyKey();
    const result = await enqueue(async (): Promise<ApiResult<OwnerOffer> | null> => {
      if (!(await saveFields())) return null;
      const current = offerRef.current as OwnerOffer;
      return apiRequest<OwnerOffer>(`/api/v1/offers/${current.id}/publish`, {
        method: "POST",
        json: expectations(current),
        idempotencyKey: publishKey.current as string,
      });
    });
    if (result?.ok) {
      router.push(`/offers/${result.data.id}/published`);
      return;
    }
    // Only a network failure keeps the key, so a retry can't publish twice.
    if (result && result.error.code !== "NETWORK") publishKey.current = null;
    if (result) await handleFailure(result.error, result.status);
    setPublishing(false);
  }

  // Photos ---------------------------------------------------------------

  // The ref is updated at once so queued uploads read the latest entry.
  function updatePending(localId: string, change: Partial<PendingUpload>) {
    pendingRef.current = pendingRef.current.map((p) => (p.localId === localId ? { ...p, ...change } : p));
    setPending(pendingRef.current);
  }

  function dropPending(localId: string) {
    const gone = pendingRef.current.find((p) => p.localId === localId);
    if (gone?.previewUrl) URL.revokeObjectURL(gone.previewUrl);
    pendingRef.current = pendingRef.current.filter((p) => p.localId !== localId);
    setPending(pendingRef.current);
  }

  async function uploadOne(localId: string, allowRetry = true): Promise<void> {
    const item = pendingRef.current.find((p) => p.localId === localId);
    if (!item) return;
    const current = await ensureDraft();
    if (!current) {
      updatePending(localId, { state: "error", retryable: true, message: "This photo couldn't be uploaded." });
      return;
    }
    const sent = item.sent ?? { revision: current.revision, status: current.status };
    updatePending(localId, { state: "uploading", progress: 0, sent });
    const form = new FormData();
    form.set("file", item.file);
    form.set("expected_revision", String(sent.revision));
    form.set("expected_status", sent.status);
    form.set("alt_text", "");
    const result = await uploadWithProgress<OwnerOffer>(`/api/v1/offers/${current.id}/photos`, form, item.key, (progress) =>
      updatePending(localId, { progress }),
    );
    if (result.ok) {
      applyOffer(result.data);
      dropPending(localId);
      return;
    }
    if (result.error.code === "NETWORK") {
      // Same key and body on retry: if the first attempt arrived, the stored response comes back.
      updatePending(localId, { state: "error", retryable: true, message: "Upload interrupted." });
      return;
    }
    if (result.error.code === "CONFLICT" && allowRetry) {
      // The offer changed (or an earlier interrupted attempt never arrived): try once more as a new attempt.
      const latest = result.error.offer ?? (await refreshOffer());
      if (latest) {
        applyOffer(latest);
        updatePending(localId, { key: newIdempotencyKey(), sent: undefined });
        await uploadOne(localId, false);
        return;
      }
    }
    if (result.status === 401) {
      await handleFailure(result.error, result.status);
      return;
    }
    updatePending(localId, {
      state: "error",
      retryable: result.error.code === "INTERNAL",
      message: result.error.fields?.file ?? errorMessage(result.error),
      key: newIdempotencyKey(),
      sent: undefined,
    });
  }

  async function addFiles(files: File[]) {
    setAlert(null);
    setErrors((current) => withoutKey(current, "photos"));
    const slots = OFFER_LIMITS.photosMax - (offerRef.current?.photos.length ?? 0) - pendingRef.current.filter((p) => p.state !== "error").length;
    if (files.length > slots) {
      setAlert({ tone: "info", text: `An offer can have at most ${String(OFFER_LIMITS.photosMax)} photos. Only the first ${String(Math.max(slots, 0))} were added.` });
    }
    for (const file of files.slice(0, Math.max(slots, 0))) {
      const localId = newIdempotencyKey();
      const entry: PendingUpload = { localId, name: file.name, file, key: newIdempotencyKey(), previewUrl: null, state: "checking", progress: 0, retryable: false };
      pendingRef.current = [...pendingRef.current, entry];
      setPending(pendingRef.current);
      const check = await checkChosenPhoto(file);
      if (!check.ok) {
        updatePending(localId, { state: "error", message: check.message, retryable: false });
        continue;
      }
      updatePending(localId, { previewUrl: URL.createObjectURL(file), state: "queued" });
      void enqueue(() => uploadOne(localId));
    }
  }

  async function photoAction(path: string, method: "DELETE" | "PUT" | "PATCH", body: (current: OwnerOffer) => object) {
    setAlert(null);
    setPhotoBusy(true);
    await enqueue(async () => {
      const current = offerRef.current;
      if (!current) return;
      const result = await apiRequest<OwnerOffer>(`/api/v1/offers/${current.id}${path}`, {
        method,
        json: { ...expectations(current), ...body(current) },
        idempotencyKey: newIdempotencyKey(),
      });
      if (result.ok) applyOffer(result.data);
      else await handleFailure(result.error, result.status);
    });
    setPhotoBusy(false);
  }

  function movePhoto(photoId: string, toIndex: number) {
    void photoAction("/photos/order", "PUT", (current) => {
      const ids = current.photos.map((p) => p.id).filter((id) => id !== photoId);
      ids.splice(toIndex, 0, photoId);
      return { photo_ids: ids };
    });
  }

  // Rendering ------------------------------------------------------------

  const photoCount = offer?.photos.length ?? 0;
  const statusText = saveState === "saving" ? "Saving…" : saveState === "saved" ? (isDraft ? "Draft saved" : "Changes saved") : dirty ? "Unsaved changes" : "";
  // Uploading: Next waits until at least one photo has finished (02-offer-creation.md).
  const nextBlocked = step === 0 && uploading && photoCount === 0;
  const heading = offer ? (isDraft ? "Edit draft" : "Edit offer") : "Create an offer";
  const statusNote =
    status === "active"
      ? "Changes you save are visible to everyone straight away. The offer must keep meeting every publishing rule."
      : status === "paused"
        ? "This offer is paused and hidden from others. Changes must keep meeting every publishing rule."
        : null;

  const actions = (
    <div className="flex flex-col gap-2">
      {isDraft ? (
        <>
          <Button onClick={() => void publish()} loading={publishing} disabled={saveState === "saving"}>
            Publish offer
          </Button>
          <Button variant="secondary" onClick={() => void save()} loading={saveState === "saving"} disabled={publishing}>
            Save draft
          </Button>
        </>
      ) : (
        <Button onClick={() => void save()} loading={saveState === "saving"}>
          Save changes
        </Button>
      )}
      {mode === "edit" ? (
        <Button id="preview-open" variant="tertiary" icon={<Eye aria-hidden="true" className="size-4" />} onClick={() => setMode("preview")}>
          Preview
        </Button>
      ) : (
        <Button
          variant="tertiary"
          icon={<PencilLine aria-hidden="true" className="size-4" />}
          onClick={() => {
            setMode("edit");
            setFocusRequest({ ids: ["step-status", "preview-open"] });
          }}
        >
          Back to editing
        </Button>
      )}
      {/* One status line at a time: on small screens it sits in the step bar while editing. */}
      {compact && mode === "edit" ? null : (
        <p aria-live="polite" className="min-h-5 text-body-sm text-text-secondary">
          {statusText}
        </p>
      )}
    </div>
  );

  return (
    <main className={cx("mx-auto flex max-w-7xl flex-col gap-6 px-4 pt-8 pb-12 md:px-6 md:pt-12 md:pb-16 lg:px-8", mode === "edit" && "max-md:pb-32")}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h1 md:text-h2-lg">{heading}</h1>
        {status ? <OfferStatusBadge status={status} /> : null}
      </div>
      {statusNote ? <p className="text-body-sm text-text-secondary">{statusNote}</p> : null}
      {!status || status === "draft" ? (
        <p className="text-body-sm text-text-secondary">
          Before you publish, check{" "}
          <Link href="/rules" target="_blank" className="font-semibold text-accent-primary underline-offset-2 hover:underline">
            what can&apos;t be offered
          </Link>
          .
        </p>
      ) : null}
      {alert ? (
        <FormAlert tone={alert.tone}>
          <p>{alert.text}</p>
          {alert.details?.length ? (
            <ul className="mt-1 list-disc pl-5">
              {alert.details.map((detail) => (
                <li key={detail}>{detail}</li>
              ))}
            </ul>
          ) : null}
          {alert.action ? (
            <Button size="sm" variant="tertiary" className="-ml-3 mt-1" onClick={alert.action.run}>
              {alert.action.label}
            </Button>
          ) : null}
        </FormAlert>
      ) : null}

      {mode === "edit" ? (
        <div className="flex flex-col gap-2 md:hidden">
          <p id="step-status" tabIndex={-1} className="text-body-sm font-semibold text-text-secondary focus:outline-none">
            Step {step + 1} of {FORM_STEPS.length}: {FORM_STEPS[step]?.title}
          </p>
          <div aria-hidden="true" className="grid grid-cols-3 gap-1">
            {FORM_STEPS.map((item, index) => (
              <span key={item.id} className={cx("h-1 rounded-full", index <= step ? "bg-accent-primary" : "bg-border-default")} />
            ))}
          </div>
        </div>
      ) : null}

      {mode === "preview" ? (
        <section aria-labelledby="preview-heading" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="preview-heading" tabIndex={-1} className="text-h2 focus:outline-none">
              Preview
            </h2>
            <p className="text-body-sm text-text-secondary">This is how other members will see your offer, including what you haven&apos;t saved yet.</p>
          </div>
          <div className="rounded-xl border border-border-default bg-bg-base p-4 md:p-6">
            <OfferDetail
              {...values}
              headingLevel={2}
              photos={(offer?.photos ?? []).map((p) => ({ key: p.id, src: p.url, alt: p.alt_text }))}
              owner={owner}
            />
          </div>
          <div className="max-w-xs">{actions}</div>
        </section>
      ) : (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
          className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12"
        >
          <div className="flex flex-col gap-8 md:gap-6">
            <section className={cx("flex flex-col gap-6 md:rounded-xl md:border md:border-border-default md:bg-bg-surface md:p-8 md:shadow-card", step !== 0 && "max-md:hidden")}>
              <SegmentedControl
                name="offer_type"
                legend="What are you offering?"
                required
                options={TYPE_OPTIONS}
                value={values.offer_type}
                onChange={(event) => chooseType(event.target.value as OfferType)}
                error={errors.offer_type}
              />
              <PhotoManager
                photos={offer?.photos ?? []}
                pending={pending}
                error={errors.photos}
                hint={service ? "A photo of your work, your tools or a sample" : undefined}
                busy={photoBusy}
                onAddFiles={(files) => void addFiles(files)}
                onRemove={(photoId) => void photoAction(`/photos/${photoId}`, "DELETE", () => ({}))}
                onMove={movePhoto}
                onAltText={(photoId, altText) => void photoAction(`/photos/${photoId}`, "PATCH", () => ({ alt_text: altText }))}
                onRetry={(localId) => {
                  updatePending(localId, { state: "queued", message: undefined });
                  void enqueue(() => uploadOne(localId));
                }}
                onDismiss={dropPending}
              />
            </section>

            <section
              aria-labelledby="details-heading"
              className={cx("flex flex-col gap-4 md:rounded-xl md:border md:border-border-default md:bg-bg-surface md:p-8 md:shadow-card", step !== 1 && "max-md:hidden")}
            >
              <h2 id="details-heading" className="text-h3">
                Details
              </h2>
              <TextField
                id="title"
                name="title"
                label="Title"
                required
                maxLength={OFFER_LIMITS.titleMax}
                helper={`${String(OFFER_LIMITS.titleMinToPublish)} to ${String(OFFER_LIMITS.titleMax)} characters.`}
                value={values.title}
                onChange={(event) => setField("title", event.target.value)}
                error={errors.title}
              />
              <Select
                id="category"
                name="category"
                label="Category"
                required
                placeholder="Choose a category"
                options={categoryOptions(values.offer_type)}
                value={values.category ?? ""}
                onChange={(event) => setField("category", (event.target.value || null) as OfferCategory | null)}
                error={errors.category}
              />
              {service ? null : (
                <SegmentedControl
                  name="condition"
                  legend="Condition"
                  required
                  options={CONDITION_OPTIONS}
                  value={values.condition ?? ""}
                  onChange={(event) => setField("condition", event.target.value as OfferCondition)}
                  error={errors.condition}
                />
              )}
              <Textarea
                id="description"
                name="description"
                label="Description"
                maxLength={OFFER_LIMITS.descriptionMax}
                value={values.description}
                onChange={(event) => setField("description", event.target.value)}
                error={errors.description}
              />
            </section>

            <section
              aria-labelledby="terms-heading"
              className={cx("flex flex-col gap-4 md:rounded-xl md:border md:border-border-default md:bg-bg-surface md:p-8 md:shadow-card", step !== 2 && "max-md:hidden")}
            >
              <h2 id="terms-heading" className="text-h3">
                Exchange terms
              </h2>
              <Textarea
                id="offering_text"
                name="offering_text"
                label={service ? "What the service includes" : "What you're offering"}
                required
                maxLength={OFFER_LIMITS.shortTextMax}
                value={values.offering_text}
                onChange={(event) => setField("offering_text", event.target.value)}
                error={errors.offering_text}
              />
              <Textarea
                id="wants_text"
                name="wants_text"
                label="What you'd like in return"
                required
                maxLength={OFFER_LIMITS.shortTextMax}
                helper="You can write “Open to offers”."
                value={values.wants_text}
                onChange={(event) => setField("wants_text", event.target.value)}
                error={errors.wants_text}
              />
              <ExchangeBuilder offering={values.offering_text} wants={values.wants_text} photo={offer?.photos[0]?.thumb_url ?? null} />
              <div className="flex flex-col gap-4 border-t border-border-default pt-5">
                <div className="flex flex-col gap-1">
                  <h3 className="text-body font-semibold">Where and how</h3>
                  <p className="flex items-start gap-1.5 text-body-sm text-text-secondary">
                    <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>Members see only the general area. Don&apos;t add your address: exact meeting details are agreed privately later.</span>
                  </p>
                </div>
                <SegmentedControl
                  name="exchange_mode"
                  legend="Where the exchange happens"
                  options={MODE_OPTIONS}
                  value={values.exchange_mode ?? ""}
                  onChange={(event) => {
                    const mode = event.target.value as OfferExchangeMode;
                    const allowed = methodOptionsFor(values.offer_type, mode).map((option) => option.value);
                    setField("exchange_mode", mode);
                    setField("handover_methods", values.handover_methods.filter((method) => allowed.includes(method)));
                    if (mode === "remote") setField("area", null);
                  }}
                  error={errors.exchange_mode}
                />
                <CheckboxGroup
                  name="handover_methods"
                  legend="How the exchange happens"
                  options={methodOptionsFor(values.offer_type, values.exchange_mode)}
                  value={values.handover_methods}
                  onChange={(next) => setField("handover_methods", next as OfferHandoverMethod[])}
                  helper="Choose all that apply."
                  error={errors.handover_methods}
                />
                {values.exchange_mode === "remote" ? null : (
                  <Select
                    id="area"
                    name="area"
                    label="General area"
                    placeholder="Choose an area"
                    helper="Ibadan only for now."
                    options={AREA_OPTIONS}
                    value={values.area ?? ""}
                    onChange={(event) => setField("area", (event.target.value || null) as OfferFields["area"])}
                    error={errors.area}
                  />
                )}
              </div>
            </section>
          </div>

          <aside aria-label="Offer actions" className="flex flex-col gap-6 max-md:hidden lg:sticky lg:top-6 lg:self-start">
            {/* Live preview on wide screens (owner, 2026-10-17). Phones keep the preview step. */}
            <section aria-labelledby="live-preview-heading" className="hidden flex-col gap-3 lg:flex">
              <h2 id="live-preview-heading" className="text-body-sm font-semibold">
                Preview
              </h2>
              <div className="flex flex-col rounded-xl bg-bg-surface p-2 shadow-card ring-1 ring-border-default/70">
                <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-bg-subtle">
                  {offer?.photos[0]?.thumb_url ? (
                    // The cover thumbnail; decorative here, the title follows.
                    <Image src={offer.photos[0].thumb_url} alt="" fill unoptimized sizes="20rem" className="object-cover" />
                  ) : (
                    <p className="flex size-full items-center justify-center p-4 text-center text-body-sm text-text-muted">Your cover photo appears here</p>
                  )}
                  {values.category ? (
                    <span className="absolute bottom-2.5 left-2.5 rounded-full bg-bg-surface/95 px-2.5 py-1 text-caption text-text-primary shadow-sm">
                      {OFFER_CATEGORIES[values.category]}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col px-2 pt-3.5 pb-2">
                  <p className="line-clamp-2 font-display text-h3 font-medium tracking-tight break-words">{values.title || "Untitled offer"}</p>
                  <p className="mt-1 truncate text-body-sm text-text-secondary">{values.offering_text || "Not filled in yet"}</p>
                  <div className="mt-3 flex items-center gap-2.5">
                    <MemberInitial name={owner.display_name} size="md" />
                    <div className="flex min-w-0 flex-col">
                      <p className="truncate text-caption font-semibold">{owner.display_name ?? "BATR member"}</p>
                      {values.exchange_mode !== "remote" && areaLabel(values.area) ? (
                        <span className="flex min-w-0 items-center gap-1 text-caption font-normal text-text-muted">
                          <MapPin aria-hidden="true" className="size-3 shrink-0" />
                          <span className="truncate">{areaLabel(values.area)}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ExchangePair offering={values.offering_text} wants={values.wants_text} variant="return" className="mt-3.5" />
                </div>
              </div>
              <p className="text-caption text-text-muted">This is how your offer appears in Explore.</p>
            </section>
            <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-bg-surface p-5 shadow-card">
              <p className="text-body-sm text-text-secondary">
                {photoCount} of {OFFER_LIMITS.photosMax} photos
                {uploading ? " · uploading…" : ""}
              </p>
              {actions}
            </div>
          </aside>
        </form>
      )}

      {mode === "edit" ? (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border-default bg-bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-sm md:hidden">
          <div className="flex items-center gap-3">
            {step > 0 ? (
              <Button size="lg" variant="secondary" icon={<ArrowLeft aria-hidden="true" className="size-4" />} onClick={previousStep}>
                Back
              </Button>
            ) : null}
            <p aria-live="polite" className="min-w-0 flex-1 truncate text-caption text-text-secondary">
              {compact ? statusText : ""}
            </p>
            <Button size="lg" loading={saveState === "saving"} disabled={nextBlocked || publishing} onClick={() => void nextStep()}>
              {step === LAST_STEP ? "Preview" : "Next"}
              {step === LAST_STEP ? null : <ArrowRight aria-hidden="true" className="size-4" />}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={leaveTo !== null}
        title="Leave without saving?"
        confirmLabel="Leave without saving"
        cancelLabel="Stay on this page"
        confirmVariant="danger"
        onConfirm={leaveWithoutSaving}
        onCancel={() => setLeaveTo(null)}
      >
        <p>
          {dirty ? "Changes you haven't saved will be lost." : null}
          {dirty && uploading ? " " : null}
          {uploading ? "Photos that are still uploading may not be added." : null}
        </p>
      </ConfirmDialog>
    </main>
  );
}
