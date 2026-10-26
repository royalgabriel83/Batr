import {
  BlockInputSchema,
  LiftSuspensionInputSchema,
  ModerationActionInputSchema,
  ReportInputSchema,
  SAFETY_FORBIDDEN_MESSAGES,
  SAFETY_LIMITS,
  SAFETY_MESSAGES,
  SuspensionAppealInputSchema,
  CASE_RISKS,
  CASE_SUBJECTS,
  itemLabel,
  type ItemView,
  type CaseRisk,
  type CaseStatus,
  type CaseSubject,
  type ModerationAction,
  type ModerationReason,
} from "@batr/shared";
import { getCaller, requireId, requireIdempotencyKey, requireMember, type ApiCaller } from "./auth";
import { parseBody } from "./body";
import { errorMapper, type Json } from "./proposals";
import { ApiError, ok } from "./respond";
import { offerView, type OfferRow } from "./views";

import type { BlockedMemberView, MyReportView } from "@batr/shared";
export type { BlockedMemberView, MyReportView };

// Blocking, reports and moderation (specs/milestone-6.md). The database
// decides who may act and what a moderator may see (S6); member ids
// never leave the server: members are named by display name only.

export interface SafetyStatus {
  suspended: boolean;
  moderator: boolean;
  /** Milestone 8, W8. */
  senior: boolean;
  /** W7: a warning the member hasn't seen yet. */
  warned: boolean;
}

/** A case in the queue (milestone-8-moderation-and-disputes.md, W1 and W2). */
export interface ReportSummaryView {
  id: string;
  case_number: number;
  subject_type: CaseSubject;
  label: string;
  reason: ModerationReason;
  details: string;
  status: CaseStatus;
  risk: CaseRisk;
  reporter_name: string;
  /** Opened by BATR's contact-detail check, not a member. */
  automatic: boolean;
  member_name: string;
  assignee_name: string | null;
  assigned_to_me: boolean;
  created_at: string;
  reviewed_at: string | null;
}

type Role = "owner" | "proposer";

/** D3: the exchange a problem is about, as a moderator sees it. */
export interface CaseAgreementView {
  status: string;
  paused: boolean;
  created_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  reporter_role: Role;
  /** Labels only: snapshots carry storage paths that never leave the server. */
  terms: {
    number: number;
    gives: string[];
    gets: string[];
    cash: { amount_naira: number; payer: Role } | null;
  } | null;
  confirmed: { role: Role; confirmed_at: string }[];
  events: { action: string; by: Role | null; created_at: string }[];
  reply: string | null;
  replied_at: string | null;
}

export type CaseAction = ModerationAction | "take";

export interface ContextMessageView {
  id: number;
  kind: "text" | "system";
  body: string | null;
  event: string | null;
  from: "reported" | "other" | null;
  reported: boolean;
  created_at: string;
}

type ModerationOfferRow = OfferRow & { removed_at: string | null };

interface ReportDetailRow extends ReportSummaryView {
  subject: {
    offer?: ModerationOfferRow;
    offers?: { id: string; title: string; status: string; removed_at: string | null }[];
    messages?: ContextMessageView[];
    other_name?: string;
    agreement?: CaseAgreementView;
  };
  member_suspended: boolean;
  /** W5: the member's history as counts only, never other cases' content. */
  member_counts: { reports_30_days: number; earlier_actions: number; breaches: number };
  /** This case's own log. */
  history: { action: LoggedAction; note: string; moderator_name: string; created_at: string }[];
  actions: Record<CaseAction, boolean>;
}

export type LoggedAction = ModerationAction | "unsuspend" | "assign" | "appeal_upheld" | "appeal_lifted";

export interface SuspensionView {
  id: string;
  member_name: string;
  note: string | null;
  created_at: string;
  /** W8: made by the viewer, so they can lift it without being senior. */
  mine: boolean;
  appeal_outcome: "upheld" | "lifted" | null;
}

/** W3: the queue's filters, as the query string carries them. */
export interface QueueFilters {
  type?: CaseSubject;
  risk?: CaseRisk;
  status?: "active" | "open" | "in_review" | "closed";
  assigned?: "me" | "unassigned";
  q?: string;
}

const QUEUE_STATUSES = ["active", "open", "in_review", "closed"] as const;
const QUEUE_ASSIGNED = ["me", "unassigned"] as const;

const pick = <T extends string>(value: string | null | undefined, allowed: readonly T[]): T | undefined =>
  value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

/** Unknown filter values are ignored, so a stale link still shows the queue. */
export function queueFilters(params: URLSearchParams | Record<string, string | string[] | undefined>): QueueFilters {
  const get = (name: string) => {
    if (params instanceof URLSearchParams) return params.get(name);
    const value = params[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const q = get("q")?.trim().slice(0, 100);
  return {
    type: pick(get("type"), CASE_SUBJECTS),
    risk: pick(get("risk"), CASE_RISKS),
    status: pick(get("status"), QUEUE_STATUSES),
    assigned: pick(get("assigned"), QUEUE_ASSIGNED),
    q: q || undefined,
  };
}

const toSafetyError = errorMapper({
  forbidden: {
    ...SAFETY_FORBIDDEN_MESSAGES,
    own: "You can't block or report yourself.",
    senior_only: "Only a senior moderator can do this.",
  },
  conflict: {
    status_changed: "This has changed. Refresh to see the latest.",
    already_reported: "You've already reported this. BATR will review it.",
    already_reviewed: "This report has already been reviewed.",
    offer_closed: "This offer is already closed.",
    already_suspended: "This member is already suspended.",
    already_lifted: "This suspension has already been lifted.",
    already_decided: "An appeal has already been decided for this suspension.",
  },
  fields: {
    invalid: "This value isn't valid.",
    subject: SAFETY_MESSAGES.subject,
    length: `Keep this to ${String(SAFETY_LIMITS.detailsMax)} characters or fewer.`,
  },
  notFound: "This isn't available.",
  conflictDetail: [],
});

/** Field errors whose meaning depends on the field. */
const FIELD_OVERRIDES: Record<string, string> = {
  subject: SAFETY_MESSAGES.subject,
  subject_type: SAFETY_MESSAGES.subject,
  reason: SAFETY_MESSAGES.reason,
  note: SAFETY_MESSAGES.note,
  action: "Choose an action.",
  outcome: "Choose an outcome.",
};

async function rpc<T>(caller: ApiCaller, fn: string, args: Json = {}): Promise<T> {
  const { data, error } = await caller.client.rpc(fn, args);
  if (error) {
    const mapped = toSafetyError(error);
    const fields = mapped.extra.fields;
    if (fields) {
      for (const name of Object.keys(fields)) if (FIELD_OVERRIDES[name]) fields[name] = FIELD_OVERRIDES[name];
    }
    throw mapped;
  }
  return data as T;
}

async function requireReader(request: Request): Promise<ApiCaller> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  return caller;
}

// Blocks ------------------------------------------------------------

export async function blockMember(request: Request): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const body = await parseBody(request, BlockInputSchema);
  const result = await rpc<{ blocked: true; display_name: string }>(caller, "member_block", {
    p_offer_id: body.offer_id ?? null,
    p_proposal_id: body.proposal_id ?? null,
    p_idempotency_key: key,
  });
  return ok(result, 201);
}

export const blockedMembersFor = (caller: ApiCaller) => rpc<BlockedMemberView[]>(caller, "member_blocks");

export async function listBlocks(request: Request): Promise<Response> {
  return ok({ blocks: await blockedMembersFor(await requireReader(request)) });
}

export async function unblockMember(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  return ok(await rpc<{ unblocked: true }>(caller, "member_unblock", { p_block_id: requireId(id) }));
}

// Reports -----------------------------------------------------------

export async function createReport(request: Request): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const body = await parseBody(request, ReportInputSchema);
  const report = await rpc<{ id: string; status: "received" }>(caller, "report_create", {
    p_subject_type: body.subject_type,
    p_offer_id: body.offer_id ?? null,
    p_proposal_id: body.proposal_id ?? null,
    p_message_id: body.message_id ?? null,
    p_reason: body.reason,
    p_details: body.details,
    p_idempotency_key: key,
  });
  return ok(report, 201);
}

export const myReportsFor = (caller: ApiCaller) => rpc<MyReportView[]>(caller, "my_reports");

export async function listMyReports(request: Request): Promise<Response> {
  return ok({ reports: await myReportsFor(await requireReader(request)) });
}

export const safetyStatusFor = (caller: ApiCaller) => rpc<SafetyStatus>(caller, "my_safety_status");

// Moderation --------------------------------------------------------

export const moderationQueueFor = (caller: ApiCaller, filters: QueueFilters = {}) =>
  rpc<ReportSummaryView[]>(caller, "moderation_queue", {
    p_type: filters.type ?? null,
    p_risk: filters.risk ?? null,
    p_status: filters.status ?? "active",
    p_assigned: filters.assigned ?? null,
    p_search: filters.q ?? null,
  });

export async function listModerationQueue(request: Request): Promise<Response> {
  const caller = await requireModeratorCaller(request);
  return ok({ reports: await moderationQueueFor(caller, queueFilters(new URL(request.url).searchParams)) });
}

export async function markWarningSeen(request: Request): Promise<Response> {
  const caller = await requireMember(request);
  await rpc<null>(caller, "warning_seen");
  return ok({ seen: true });
}

/** Anyone not signed in gets 404 too: the workspace isn't advertised. */
async function requireModeratorCaller(request: Request): Promise<ApiCaller> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("NOT_FOUND", { message: "This isn't available." });
  return caller;
}

/** The reported offer as a moderator sees it: public fields, signed photo links, when it closed and whether BATR removed it. */
export type ModerationOfferView = Omit<Awaited<ReturnType<typeof offerView>>, "owner" | "is_owner"> & {
  closed_at: string | null;
  removed_at: string | null;
};

export type ModerationReportView = Omit<ReportDetailRow, "subject"> & {
  subject: Omit<ReportDetailRow["subject"], "offer"> & { offer?: ModerationOfferView };
};

/** A report as the moderator sees it, with photo links signed and storage paths removed. */
async function reportView(caller: ApiCaller, row: ReportDetailRow): Promise<ModerationReportView> {
  const { offer, ...subject } = row.subject;
  const terms = subject.agreement?.terms as (Omit<NonNullable<CaseAgreementView["terms"]>, "gives" | "gets"> & { gives: ItemView[]; gets: ItemView[] }) | null | undefined;
  if (subject.agreement && terms) {
    subject.agreement = { ...subject.agreement, terms: { ...terms, gives: terms.gives.map(itemLabel), gets: terms.gets.map(itemLabel) } };
  }
  if (!offer) return { ...row, subject };
  const view: Partial<Awaited<ReturnType<typeof offerView>>> = await offerView(caller.client, { ...offer, owner: null }, null);
  delete view.owner;
  delete view.is_owner;
  const fields = view as ModerationOfferView;
  return { ...row, subject: { ...subject, offer: { ...fields, closed_at: offer.closed_at, removed_at: offer.removed_at } } };
}

export async function moderationReportFor(caller: ApiCaller, id: string): Promise<ModerationReportView> {
  const row = await rpc<ReportDetailRow>(caller, "moderation_report", { p_report_id: requireId(id) });
  return reportView(caller, row);
}

export async function getModerationReport(request: Request, id: string): Promise<Response> {
  return ok(await moderationReportFor(await requireModeratorCaller(request), id));
}

export async function actOnReport(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const reportId = requireId(id);
  const body = await parseBody(request, ModerationActionInputSchema);
  const row = await rpc<ReportDetailRow>(caller, "moderation_act", {
    p_report_id: reportId,
    p_action: body.action,
    p_note: body.note,
    p_idempotency_key: key,
    p_target: body.target,
  });
  return ok(await reportView(caller, row));
}

/** W4: take a case, or take it over. Logged in the case. */
export async function assignReport(request: Request, id: string): Promise<Response> {
  const caller = await requireModeratorCaller(request);
  const row = await rpc<ReportDetailRow>(caller, "moderation_assign", { p_report_id: requireId(id) });
  return ok(await reportView(caller, row));
}

export const suspensionsFor = (caller: ApiCaller) => rpc<SuspensionView[]>(caller, "moderation_suspensions");

export async function listSuspensions(request: Request): Promise<Response> {
  return ok({ suspensions: await suspensionsFor(await requireModeratorCaller(request)) });
}

export async function liftSuspension(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const suspensionId = requireId(id);
  const body = await parseBody(request, LiftSuspensionInputSchema);
  return ok(
    await rpc<{ lifted: true }>(caller, "moderation_unsuspend", {
      p_suspension_id: suspensionId,
      p_note: body.note,
      p_idempotency_key: key,
    }),
  );
}

/** W9: a senior moderator records the outcome of an appeal made by email. */
export async function recordAppeal(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const suspensionId = requireId(id);
  const body = await parseBody(request, SuspensionAppealInputSchema);
  return ok(
    await rpc<{ outcome: "upheld" | "lifted" }>(caller, "moderation_record_appeal", {
      p_suspension_id: suspensionId,
      p_outcome: body.outcome,
      p_note: body.note,
      p_idempotency_key: key,
    }),
  );
}
