import { createHash, randomUUID } from "node:crypto";
import type { PostgrestError } from "@supabase/supabase-js";
import {
  API_ERROR_STATUS,
  AppealActionSchema,
  AppealInputSchema,
  EVIDENCE_LIMITS,
  EVIDENCE_MESSAGES,
  EvidenceFieldsSchema,
  InspectionActionSchema,
  ReviewActionSchema,
  SaveValuationInputSchema,
  SubmitValuationInputSchema,
  VALUATION_LIMITS,
  WithdrawValuationInputSchema,
  checkEvidenceFile,
  cleanDetails,
  pdfHasActiveContent,
  type ApiErrorCode,
  type OfferAssessmentView,
  type ValuationSummaryView,
} from "@batr/shared";
import { processEvidenceImage, UnreadableEvidenceError } from "@/server/valuation/process";
import { VALUATION_CONFLICTS, VALUATION_FORBIDDEN, valuationFieldMessages } from "@/server/valuation/messages";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";
import { serviceKey } from "@/server/storage/deleter";
import { getCaller, requireId, requireIdempotencyKey, requireMember, type ApiCaller } from "./auth";
import { checkOrFail, parseBody } from "./body";
import { ApiError, ok } from "./respond";

// The valuation endpoints (owner, 2026-10-17; specs/valuation-and-fees.md).
// Every mutation: signed in, Idempotency-Key, body checked with the
// shared schemas, then one database function that checks who is acting
// and the expected revision, writes, records an event and stores the
// response. The database repeats every rule.

export const EVIDENCE_BUCKET = "valuation-evidence";
type Json = Record<string, unknown>;
type Valuation = Json & { id: string; evidence?: { id: string; mime: string }[]; submitter?: { id: string } };

/** A valuation function error as an API error with valuation wording. */
function toValuationError(error: PostgrestError): ApiError {
  const code = error.message as ApiErrorCode;
  if (!/^PT\d{3}$/.test(error.code) || !(code in API_ERROR_STATUS)) {
    console.error("Database error", error);
    return new ApiError("INTERNAL");
  }
  let detail: Json = {};
  try {
    detail = JSON.parse(error.details) as Json;
  } catch {
    // no detail
  }
  const reason = typeof detail.reason === "string" ? detail.reason : undefined;
  if (code === "VALIDATION_FAILED") return new ApiError(code, { fields: valuationFieldMessages(detail.fields) });
  if (code === "CONFLICT") {
    const extra: Json = { reason: reason ?? "status_changed", message: VALUATION_CONFLICTS[reason ?? "status_changed"] ?? VALUATION_CONFLICTS.status_changed };
    if ("current_status" in detail) extra.current_status = detail.current_status;
    if ("current_revision" in detail) extra.current_revision = detail.current_revision;
    return new ApiError(code, extra);
  }
  if (code === "FORBIDDEN") {
    return new ApiError(code, { ...(reason ? { reason } : {}), message: (reason && VALUATION_FORBIDDEN[reason]) || "You can't do this." });
  }
  if (code === "NOT_FOUND") return new ApiError(code, { message: "This valuation isn't available." });
  if (code === "UNSUPPORTED_FORMAT" && reason === "pdf_disabled") {
    return new ApiError(code, { message: EVIDENCE_MESSAGES.pdfDisabled, fields: { file: EVIDENCE_MESSAGES.pdfDisabled } });
  }
  return new ApiError(code);
}

export async function rpcValuation<T = Valuation>(caller: ApiCaller, fn: string, args: Json): Promise<T> {
  const { data, error } = await caller.client.rpc(fn, args);
  if (error) throw toValuationError(error);
  return data as T;
}

// Member ------------------------------------------------------------

export async function getOfferValuation(request: Request, offerId: string): Promise<Response> {
  const caller = await requireMember(request);
  return ok(await rpcValuation<Valuation | null>(caller, "valuation_for_offer", { p_offer_id: requireId(offerId) }));
}

/**
 * The offer page's "Assessed by BATR" (specs/milestone-2.md, unit 11):
 * the value for signed-in members, only whether there is one for
 * visitors. Both database functions check who may see the offer.
 */
export async function getOfferAssessment(request: Request, offerId: string): Promise<Response> {
  const caller = await getCaller(request);
  const id = requireId(offerId);
  if (!caller.user) {
    const assessed = await rpcValuation<boolean>(caller, "offer_assessment_indicator", { p_offer_id: id });
    return ok({ assessed: assessed === true, summary: null } satisfies OfferAssessmentView);
  }
  const summary = await rpcValuation<(ValuationSummaryView & { policy_version?: number }) | null>(caller, "offer_valuation_summary", { p_offer_id: id });
  const view: OfferAssessmentView = summary
    ? {
        assessed: true,
        summary: { total_noncash_kobo: summary.total_noncash_kobo, confidence: summary.confidence, inspected: summary.inspected, assessed_at: summary.assessed_at },
      }
    : { assessed: false, summary: null };
  return ok(view);
}

export async function createValuation(request: Request, offerId: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  return ok(await rpcValuation(caller, "valuation_create", { p_offer_id: requireId(offerId), p_idempotency_key: key }), 201);
}

export async function getValuation(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  return ok(await rpcValuation(caller, "valuation_get", { p_submission_id: requireId(id) }));
}

export async function saveValuation(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const submissionId = requireId(id);
  const body = await parseBody(request, SaveValuationInputSchema);
  const draft = {
    ...body.draft,
    components: body.draft.components.map((component) => ({ ...component, details: cleanDetails(component.details) })),
  };
  return ok(
    await rpcValuation(caller, "valuation_save", {
      p_submission_id: submissionId,
      p_expected_revision: body.expected_revision,
      p_draft: draft,
      p_idempotency_key: key,
    }),
  );
}

export async function submitValuation(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const submissionId = requireId(id);
  const body = await parseBody(request, SubmitValuationInputSchema);
  return ok(
    await rpcValuation(caller, "valuation_submit", {
      p_submission_id: submissionId,
      p_expected_revision: body.expected_revision,
      p_declaration: body.declaration,
      p_note: body.note,
      p_idempotency_key: key,
    }),
  );
}

export async function withdrawValuation(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const submissionId = requireId(id);
  const body = await parseBody(request, WithdrawValuationInputSchema);
  return ok(
    await rpcValuation(caller, "valuation_withdraw", {
      p_submission_id: submissionId,
      p_expected_revision: body.expected_revision,
      p_idempotency_key: key,
    }),
  );
}

export async function appealValuation(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const submissionId = requireId(id);
  const body = await parseBody(request, AppealInputSchema);
  return ok(
    await rpcValuation(caller, "valuation_appeal", {
      p_submission_id: submissionId,
      p_expected_revision: body.expected_revision,
      p_reason: body.reason,
      p_idempotency_key: key,
    }),
  );
}

// Evidence ------------------------------------------------------------

const MAX_REQUEST_BYTES = EVIDENCE_LIMITS.maxBytes + 64 * 1024;

const tooLarge = () => new ApiError("VALIDATION_FAILED", { message: EVIDENCE_MESSAGES.tooLarge, fields: { file: EVIDENCE_MESSAGES.tooLarge } });

function serviceStorage() {
  return createClient(supabaseEnv().url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(EVIDENCE_BUCKET);
}

/** Deletes evidence files the database no longer points to (server-only key; members can't delete). */
async function deleteEvidenceFiles(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await serviceStorage().remove(paths);
    if (error) console.error("Evidence files not deleted", error.message);
  } catch (error) {
    console.error("Evidence files not deleted", error);
  }
}

/**
 * POST /api/v1/valuations/:id/evidence (multipart: file, kind,
 * component_id). Images are re-encoded as WebP; PDFs are checked for
 * active content. The file is uploaded with the member's own session,
 * so the storage policy decides whether they may add it.
 */
export async function uploadEvidence(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const submissionId = requireId(id);
  if (Number(request.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES) throw tooLarge();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ApiError("VALIDATION_FAILED", { fields: { file: "Send the file as multipart form data." } });
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError("VALIDATION_FAILED", { fields: { file: "Choose a file." } });
  const fields = checkOrFail(EvidenceFieldsSchema, {
    kind: form.get("kind") ?? undefined,
    component_id: form.get("component_id") ?? undefined,
  });
  if (file.size > EVIDENCE_LIMITS.maxBytes) throw tooLarge();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkEvidenceFile(fields.kind, { size: bytes.length, header: bytes.subarray(0, 16) });
  if (!check.ok) throw new ApiError(check.code, { message: check.message, fields: { file: check.message } });

  let stored: Buffer;
  let mime: "image/webp" | "application/pdf";
  if (check.format === "pdf") {
    if (pdfHasActiveContent(bytes)) throw new ApiError("UNSUPPORTED_FORMAT", { message: EVIDENCE_MESSAGES.unsafePdf, fields: { file: EVIDENCE_MESSAGES.unsafePdf } });
    stored = Buffer.from(bytes);
    mime = "application/pdf";
  } else {
    try {
      stored = await processEvidenceImage(bytes);
    } catch (error) {
      if (error instanceof UnreadableEvidenceError) {
        throw new ApiError("UNSUPPORTED_FORMAT", { message: EVIDENCE_MESSAGES.documentType, fields: { file: EVIDENCE_MESSAGES.documentType } });
      }
      throw error;
    }
    mime = "image/webp";
  }

  const hash = createHash("sha256")
    .update(createHash("sha256").update(bytes).digest("hex"))
    .update(JSON.stringify(fields))
    .digest("hex");
  const evidenceId = randomUUID();
  const path = `${caller.user.id}/${submissionId}/${evidenceId}.${mime === "application/pdf" ? "pdf" : "webp"}`;
  const upload = await caller.client.storage.from(EVIDENCE_BUCKET).upload(path, stored, { contentType: mime, upsert: false });
  const refused = Boolean(upload.error);
  if (upload.error) {
    const status = Number((upload.error as { statusCode?: string | number }).statusCode ?? 0);
    if (!(status === 400 || status === 403 || status === 404)) throw upload.error;
  }
  const { data, error } = await caller.client.rpc("valuation_evidence_add", {
    p_submission_id: submissionId,
    p_evidence_id: evidenceId,
    p_kind: fields.kind,
    p_component_id: fields.component_id || null,
    p_mime: mime,
    p_size_bytes: stored.length,
    p_request_hash: hash,
    p_idempotency_key: key,
  });
  if (error) {
    if (!refused) await deleteEvidenceFiles([path]);
    const apiError = toValuationError(error);
    // Storage refused the file although the submission checks passed: not something the member can fix.
    if (refused && apiError.code === "VALIDATION_FAILED" && apiError.extra.fields && "file" in apiError.extra.fields) {
      throw new ApiError("INTERNAL");
    }
    throw apiError;
  }
  const valuation = data as Valuation;
  // A retry with the same key returned the first attempt's result: this attempt's file is spare.
  if (!(valuation.evidence ?? []).some((item) => item.id === evidenceId)) await deleteEvidenceFiles([path]);
  return ok(valuation, 201);
}

export async function removeEvidence(request: Request, id: string, evidenceId: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const result = await rpcValuation<Valuation & { cleanup_paths?: string[] }>(caller, "valuation_evidence_remove", {
    p_submission_id: requireId(id),
    p_evidence_id: requireId(evidenceId),
    p_idempotency_key: key,
  });
  const { cleanup_paths: paths = [], ...valuation } = result;
  await deleteEvidenceFiles(paths);
  return ok(valuation);
}

/**
 * GET /api/v1/valuations/:id/evidence/:evidenceId: a link to the file
 * that expires after two minutes, for the member who uploaded it or
 * BATR staff. The link is created with the caller's own session, so
 * the storage read policy decides; anyone else gets 404.
 */
export async function evidenceLink(request: Request, id: string, evidenceId: string): Promise<Response> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  const submissionId = requireId(id);
  const itemId = requireId(evidenceId);
  let owner: string | null = null;
  let item: { id: string; mime: string } | undefined;
  const own = await caller.client.rpc("valuation_get", { p_submission_id: submissionId });
  if (!own.error) {
    owner = caller.user.id;
    item = (own.data as Valuation).evidence?.find((entry) => entry.id === itemId);
  } else {
    const staff = await caller.client.rpc("review_get", { p_submission_id: submissionId });
    if (!staff.error) {
      const view = staff.data as Valuation;
      owner = view.submitter?.id ?? null;
      item = view.evidence?.find((entry) => entry.id === itemId);
    }
  }
  if (!owner || !item) throw new ApiError("NOT_FOUND", { message: "This file isn't available." });
  const path = `${owner}/${submissionId}/${item.id}.${item.mime === "application/pdf" ? "pdf" : "webp"}`;
  const { data, error } = await caller.client.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, VALUATION_LIMITS.evidenceLinkSeconds);
  if (error || !data?.signedUrl) throw new ApiError("NOT_FOUND", { message: "This file isn't available." });
  return ok({ url: data.signedUrl, expires_in: VALUATION_LIMITS.evidenceLinkSeconds });
}

// Staff ------------------------------------------------------------------

export async function reviewQueue(request: Request): Promise<Response> {
  const caller = await requireMember(request);
  const status = new URL(request.url).searchParams.get("status");
  return ok(await rpcValuation(caller, "review_queue", { p_status: status || null }));
}

export async function reviewGet(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  return ok(await rpcValuation(caller, "review_get", { p_submission_id: requireId(id) }));
}

/** POST /api/v1/review/valuations/:id with `{ action, ... }`. */
export async function reviewAction(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const submissionId = requireId(id);
  const body = await parseBody(request, ReviewActionSchema);
  switch (body.action) {
    case "add_comparison":
      return ok(await rpcValuation(caller, "review_comparison_add", { p_submission_id: submissionId, p_comparison: body.comparison, p_idempotency_key: key }), 201);
    case "exclude_comparison":
      return ok(
        await rpcValuation(caller, "review_comparison_exclude", {
          p_submission_id: submissionId,
          p_comparison_id: body.comparison_id,
          p_excluded: body.excluded,
          p_reason: body.reason,
          p_idempotency_key: key,
        }),
      );
    case "add_note":
      return ok(await rpcValuation(caller, "review_note_add", { p_submission_id: submissionId, p_body: body.body, p_idempotency_key: key }), 201);
    case "decide": {
      const { expected_revision, ...decision } = body.decision;
      return ok(
        await rpcValuation(caller, "review_decide", {
          p_submission_id: submissionId,
          p_expected_revision: expected_revision,
          p_decision: decision,
          p_idempotency_key: key,
        }),
      );
    }
  }
}

/** POST /api/v1/review/inspections/:id with `{ action: schedule | complete | cancel, ... }`. */
export async function inspectionAction(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const inspectionId = requireId(id);
  const { action, ...data } = await parseBody(request, InspectionActionSchema);
  return ok(await rpcValuation(caller, "review_inspection_update", { p_inspection_id: inspectionId, p_action: action, p_data: data, p_idempotency_key: key }));
}

/** POST /api/v1/review/appeals/:id with `{ action: claim | decide, ... }`. */
export async function appealAction(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const appealId = requireId(id);
  const body = await parseBody(request, AppealActionSchema);
  if (body.action === "claim") return ok(await rpcValuation(caller, "review_appeal_claim", { p_appeal_id: appealId, p_idempotency_key: key }));
  const { expected_revision, ...decision } = body.decision;
  return ok(
    await rpcValuation(caller, "review_appeal_decide", {
      p_appeal_id: appealId,
      p_expected_revision: expected_revision,
      p_decision: decision,
      p_idempotency_key: key,
    }),
  );
}
