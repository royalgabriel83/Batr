import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AGREEMENT_BOX_IDS,
  AGREEMENT_LIMITS,
  CancellationActionInputSchema,
  CancellationInputSchema,
  HandoverInputSchema,
  ProblemReplyInputSchema,
  ProblemReportInputSchema,
  ProposeChangeInputSchema,
  SAFETY_FORBIDDEN_MESSAGES,
  SAFETY_LIMITS,
  agreementActions,
  agreementWaitsOn,
  type AgreementBox,
  type OfferType,
  type AgreementStatus,
  type Cash,
  type AgreementProblemView,
  type Schema,
  type VersionOutcome,
} from "@batr/shared";
import {
  getCaller,
  requireId,
  requireIdempotencyKey,
  requireMember,
  type ApiCaller,
} from "./auth";
import { parseBody } from "./body";
import {
  FIELD_MESSAGES,
  decodeCursor,
  encodeCursor,
  errorMapper,
  itemView,
  roleOf,
  snapshotPaths,
  type ItemRow,
  type Json,
  type MemberRow,
  type Role,
} from "./proposals";
import { ApiError, ok } from "./respond";
import { signPaths } from "./views";
import { contactDetailsError } from "./contact";

// The agreement endpoints (specs/milestone-4.md, API). As for
// proposals: every mutation is signed in, carries an Idempotency-Key,
// is checked with the shared schemas, then runs one database function
// that checks who is acting and the exact version or request they saw.
// Only the two parties can read an agreement; everyone else gets 404.
// Member ids and storage paths stay on the server.

interface VersionRow {
  id: string;
  number: number;
  proposed_by: string;
  outcome: VersionOutcome;
  gives: ItemRow[];
  gets: ItemRow[];
  cash: Cash | null;
  note: string;
  created_at: string;
  resolved_at: string | null;
}

interface RequestRow {
  id: string;
  requested_by: string;
  reason: string;
  created_at: string;
  outcome: "accepted" | "rejected" | "withdrawn" | null;
  resolved_at: string | null;
}

interface CoreRow {
  id: string;
  proposal_id: string;
  offer_id: string;
  status: AgreementStatus;
  revision: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  viewer_role: Role;
  proposer: MemberRow;
  owner: MemberRow;
  offer: { id: string; title: string; status: string } | null;
  binding_version_id: string;
  confirmed_by: string[];
  pending_by: string | null;
  cancel_requested_by: string | null;
  paused: boolean;
}

interface AgreementRow extends CoreRow {
  problem: AgreementProblemView;
  versions: VersionRow[];
  confirmations: { party_id: string; version_id: string; confirmed_at: string }[];
  cancellation: RequestRow | null;
  listing_changed: boolean;
  pending_changed_offer_ids: string[];
  fee: {
    total_kobo: number;
    owner_share_kobo: number;
    proposer_share_kobo: number;
    requires_reconfirmation: boolean;
  } | null;
  gives_choices: { id: string; title: string; thumb_path: string | null }[];
  my_listed_offers: { id: string; title: string; offer_type: OfferType }[];
}

interface SummaryRow extends CoreRow {
  terms: VersionRow;
}

// Errors ------------------------------------------------------------

const toAgreementError = errorMapper({
  forbidden: {
    ...SAFETY_FORBIDDEN_MESSAGES,
    own_change: "Only the other member can accept or reject your change.",
    not_proposer: "Only the member who proposed this change can withdraw it.",
    own_request: "Only the other member can answer your request to cancel.",
    not_requester: "Only the member who asked to cancel can withdraw the request.",
  },
  conflict: {
    status_changed:
      "This agreement has changed. Refresh to see the latest before you act.",
    stale_version:
      "The terms have changed since you opened this page. Refresh to see them.",
    stale_request:
      "This request has changed since you opened this page. Refresh to see it.",
    handover_started:
      "The terms can't change once a handover has been confirmed.",
    paused: "This is paused while BATR reviews a problem with this exchange.",
    already_reported: "A problem with this exchange is already being reviewed.",
    no_problem: "There's no open problem to reply to.",
    already_replied: "You've already added your side.",
  },
  fields: {
    ...FIELD_MESSAGES,
    length: `Give a reason of ${String(AGREEMENT_LIMITS.cancelReasonMin)} to ${String(AGREEMENT_LIMITS.cancelReasonMax)} characters.`,
  },
  notFound: "This agreement isn't available.",
  conflictDetail: ["current_status", "current_version"],
});

async function rpc<T>(caller: ApiCaller, fn: string, args: Json): Promise<T> {
  const { data, error } = await caller.client.rpc(fn, args);
  if (error) throw (await contactDetailsError(caller.client, error)) ?? toAgreementError(error);
  return data as T;
}

// Views -------------------------------------------------------------

const roleOrNull = (row: CoreRow, id: string | null): Role | null =>
  id === null ? null : roleOf(row, id);

function versionView(
  row: CoreRow,
  version: VersionRow,
  links: Map<string, string | null>,
  changed = new Set<string>(),
) {
  return {
    id: version.id,
    number: version.number,
    proposed_by: roleOf(row, version.proposed_by),
    outcome: version.outcome,
    gives: version.gives.map((item) => itemView(item, links, changed)),
    gets: version.gets.map((item) => itemView(item, links, changed)),
    cash: version.cash,
    note: version.note,
    created_at: version.created_at,
    resolved_at: version.resolved_at,
  };
}
export type VersionView = ReturnType<typeof versionView>;

/** The parts permissions need, with roles standing in for member ids. */
function access(row: CoreRow) {
  return {
    status: row.status,
    proposer_id: "proposer",
    owner_id: "owner",
    confirmed_by: row.confirmed_by.map((id) => roleOf(row, id)),
    pending_by: roleOrNull(row, row.pending_by),
    cancel_requested_by: roleOrNull(row, row.cancel_requested_by),
    paused: row.paused,
  };
}

function coreView(row: CoreRow) {
  const parties = access(row);
  return {
    id: row.id,
    proposal_id: row.proposal_id,
    status: row.status,
    revision: row.revision,
    created_at: row.created_at,
    updated_at: row.updated_at,
    completed_at: row.completed_at,
    cancelled_at: row.cancelled_at,
    viewer_role: row.viewer_role,
    proposer: { display_name: row.proposer.display_name },
    owner: { display_name: row.owner.display_name },
    offer: row.offer,
    binding_version_id: row.binding_version_id,
    confirmed_by: parties.confirmed_by,
    pending_by: parties.pending_by,
    cancel_requested_by: parties.cancel_requested_by,
    paused: row.paused,
    actions: agreementActions(parties, row.viewer_role),
    waits_on_viewer: agreementWaitsOn(parties, row.viewer_role),
  };
}

export async function agreementView(client: SupabaseClient, row: AgreementRow) {
  const links = await signPaths(client, [
    ...snapshotPaths(row.versions),
    ...row.gives_choices.flatMap((o) => (o.thumb_path ? [o.thumb_path] : [])),
  ]);
  const changed = new Set(row.pending_changed_offer_ids);
  return {
    ...coreView(row),
    versions: row.versions.map((version) =>
      versionView(
        row,
        version,
        links,
        version.outcome === "pending" ? changed : undefined,
      ),
    ),
    confirmations: row.confirmations.map((confirmation) => ({
      party: roleOf(row, confirmation.party_id),
      version_id: confirmation.version_id,
      confirmed_at: confirmation.confirmed_at,
    })),
    cancellation: row.cancellation
      ? {
          id: row.cancellation.id,
          requested_by: roleOf(row, row.cancellation.requested_by),
          reason: row.cancellation.reason,
          created_at: row.cancellation.created_at,
          outcome: row.cancellation.outcome,
          resolved_at: row.cancellation.resolved_at,
        }
      : null,
    listing_changed: row.listing_changed,
    pending_changed_offer_ids: row.pending_changed_offer_ids,
    fee: row.fee,
    my_listed_offers: row.my_listed_offers,
    problem: row.problem,
    gives_choices: row.gives_choices.map((offer) => ({
      id: offer.id,
      title: offer.title,
      thumb_url: offer.thumb_path
        ? (links.get(offer.thumb_path) ?? null)
        : null,
    })),
  };
}
export type AgreementView = Awaited<ReturnType<typeof agreementView>>;

export async function summaryViews(client: SupabaseClient, rows: SummaryRow[]) {
  const links = await signPaths(
    client,
    snapshotPaths(rows.map((row) => row.terms)),
  );
  return rows.map((row) => ({
    ...coreView(row),
    terms: versionView(row, row.terms, links),
  }));
}
export type AgreementSummaryView = Awaited<
  ReturnType<typeof summaryViews>
>[number];

// Reads -------------------------------------------------------------

async function requireReader(request: Request): Promise<ApiCaller> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  return caller;
}

export async function getAgreementFor(caller: ApiCaller, id: string) {
  return agreementView(
    caller.client,
    await rpc<AgreementRow>(caller, "agreement_get", {
      p_agreement_id: requireId(id),
    }),
  );
}

export async function getAgreement(
  request: Request,
  id: string,
): Promise<Response> {
  return ok(await getAgreementFor(await requireReader(request), id));
}

export async function listAgreementsFor(
  caller: ApiCaller,
  box: AgreementBox,
  cursor: string | null = null,
) {
  const position = decodeCursor(cursor);
  const page = await rpc<{
    items: SummaryRow[];
    next: { updated_at: string; id: string } | null;
  }>(caller, "agreement_list", {
    p_box: box,
    p_before_updated_at: position?.updated_at ?? null,
    p_before_id: position?.id ?? null,
  });
  return {
    agreements: await summaryViews(caller.client, page.items),
    next_cursor: encodeCursor(page.next),
  };
}

export async function listAgreements(request: Request): Promise<Response> {
  const caller = await requireReader(request);
  const params = new URL(request.url).searchParams;
  const box = params.get("box") ?? "active";
  if (!(AGREEMENT_BOX_IDS as string[]).includes(box)) {
    throw new ApiError("VALIDATION_FAILED", {
      fields: { box: "Choose active or closed." },
    });
  }
  return ok(
    await listAgreementsFor(caller, box as AgreementBox, params.get("cursor")),
  );
}

// Writes ------------------------------------------------------------

async function write<T>(
  request: Request,
  id: string,
  fn: string,
  schema: Schema<T>,
  args: (body: T) => Json,
): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const agreementId = requireId(id);
  const body = await parseBody(request, schema);
  const row = await rpc<AgreementRow>(caller, fn, {
    p_agreement_id: agreementId,
    ...args(body),
    p_idempotency_key: key,
  });
  return ok(await agreementView(caller.client, row));
}

export const confirmHandover = (request: Request, id: string) =>
  write(request, id, "agreement_handover", HandoverInputSchema, (body) => ({
    p_version_id: body.version_id,
  }));

export const proposeChange = (request: Request, id: string) =>
  write(
    request,
    id,
    "agreement_change_propose",
    ProposeChangeInputSchema,
    ({ expected_version, ...terms }) => ({
      p_expected_version: expected_version,
      p_terms: terms,
    }),
  );

/** Accept, reject or withdraw the pending change named in the path. */
export async function resolveChange(
  request: Request,
  id: string,
  versionId: string,
  action: "accept" | "reject" | "withdraw",
): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const row = await rpc<AgreementRow>(caller, `agreement_change_${action}`, {
    p_agreement_id: requireId(id),
    p_version_id: requireId(versionId),
    p_idempotency_key: key,
  });
  return ok(await agreementView(caller.client, row));
}

export const requestCancellation = (request: Request, id: string) =>
  write(
    request,
    id,
    "agreement_cancel_request",
    CancellationInputSchema,
    (body) => ({ p_reason: body.reason }),
  );

export const resolveCancellation = (
  request: Request,
  id: string,
  action: "accept" | "reject" | "withdraw",
) =>
  write(
    request,
    id,
    `agreement_cancel_${action}`,
    CancellationActionInputSchema,
    (body) => ({ p_request_id: body.request_id }),
  );

// Exchange problems (specs/milestone-8-moderation-and-disputes.md, D1–D5)

/** The database names the field; these say what fits there. */
const PROBLEM_FIELD_MESSAGES: Record<string, string> = {
  reason: "Choose what went wrong.",
  details: `Tell BATR what happened in ${String(SAFETY_LIMITS.problemDetailsMin)} to ${String(SAFETY_LIMITS.detailsMax)} characters.`,
  reply: `Write your side in up to ${String(SAFETY_LIMITS.problemReplyMax)} characters.`,
};

async function problemWrite<T>(
  request: Request,
  id: string,
  fn: string,
  schema: Schema<T>,
  args: (body: T) => Json,
  status: 200 | 201,
): Promise<Response> {
  try {
    const caller = await requireMember(request);
    const key = requireIdempotencyKey(request);
    const agreementId = requireId(id);
    const body = await parseBody(request, schema);
    const row = await rpc<AgreementRow>(caller, fn, { p_agreement_id: agreementId, ...args(body), p_idempotency_key: key });
    return ok(await agreementView(caller.client, row), status);
  } catch (error) {
    const fields = error instanceof ApiError && error.code === "VALIDATION_FAILED" ? error.extra.fields : undefined;
    if (fields) for (const name of Object.keys(fields)) if (PROBLEM_FIELD_MESSAGES[name]) fields[name] = PROBLEM_FIELD_MESSAGES[name];
    throw error;
  }
}

/** D1: either member reports a problem; an open agreement is paused (D2). */
export const reportProblem = (request: Request, id: string) =>
  problemWrite(request, id, "agreement_problem_report", ProblemReportInputSchema, (body) => ({
    p_reason: body.reason,
    p_details: body.details,
  }), 201);

/** D2: the other member adds their side, once. */
export const replyToProblem = (request: Request, id: string) =>
  problemWrite(request, id, "agreement_problem_reply", ProblemReplyInputSchema, (body) => ({ p_reply: body.reply }), 200);
