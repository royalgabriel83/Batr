import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  API_ERROR_STATUS,
  AcceptProposalInputSchema,
  CounterProposalInputSchema,
  CreateProposalInputSchema,
  ITEM_MESSAGES,
  PROPOSAL_BOX_IDS,
  PROPOSAL_LIMITS,
  SAFETY_FORBIDDEN_MESSAGES,
  ProposalActionInputSchema,
  proposalActions,
  type ApiErrorCode,
  type Cash,
  type ProposalBox,
  type ProposalPermissions,
  type ProposalStatus,
} from "@batr/shared";
import {
  getCaller,
  requireId,
  requireIdempotencyKey,
  requireMember,
  type ApiCaller,
} from "./auth";
import { parseBody } from "./body";
import { ApiError, ok } from "./respond";
import { signPaths } from "./views";
import { contactDetailsError } from "./contact";

// The proposal endpoints (specs/milestone-3.md, API). Every mutation:
// signed in, Idempotency-Key, body checked with the shared schemas,
// then one database function that checks who is acting, the revision
// and the turn, writes, records an event and stores the response. Only
// the two members can read a proposal; everyone else gets 404.
//
// Member ids and storage paths stay on the server: parties appear as
// "proposer" and "owner" with their display names, and snapshot photos
// as links signed with the viewer's own session.

export type Json = Record<string, unknown>;
export type Role = "proposer" | "owner";

export interface SnapshotPhotoRow {
  display_path: string;
  thumb_path: string;
  width: number;
  height: number;
  alt_text: string;
}

export type ItemRow =
  | {
      kind: "offer";
      offer_id: string;
      content_version: number;
      snapshot: {
        /** Missing on snapshots taken before services (milestone 9): an item. */
        offer_type?: "item" | "service";
        title: string;
        description: string;
        condition: string | null;
        category: string | null;
        offering_text: string;
        wants_text: string;
        photo: SnapshotPhotoRow | null;
      };
    }
  | { kind: "text"; description: string };

interface RevisionRow {
  id: string;
  number: number;
  author_id: string;
  gives: ItemRow[];
  gets: ItemRow[];
  cash: Cash | null;
  note: string;
  created_at: string;
}

export interface MemberRow {
  id: string;
  display_name: string | null;
}

interface ProposalRow {
  id: string;
  offer_id: string;
  status: ProposalStatus;
  close_reason: "offer_closed" | "blocked" | null;
  revision: number;
  latest_revision_id: string;
  latest_author_id: string;
  expires_at: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  viewer_role: Role;
  proposer: MemberRow;
  owner: MemberRow;
  offer: { id: string; title: string; status: string } | null;
  agreement_id: string | null;
  changed_offer_ids: string[];
  gives_choices: { id: string; title: string; thumb_path: string | null }[];
  revisions: RevisionRow[];
}

type SummaryRow = Pick<
  ProposalRow,
  | "id"
  | "offer_id"
  | "status"
  | "close_reason"
  | "revision"
  | "latest_author_id"
  | "expires_at"
  | "updated_at"
  | "viewer_role"
  | "proposer"
  | "owner"
> & { latest: RevisionRow };

// Errors ------------------------------------------------------------

const FORBIDDEN_MESSAGES: Record<string, string> = {
  ...SAFETY_FORBIDDEN_MESSAGES,
  own_offer: "You can't propose an exchange on your own offer.",
  not_your_turn:
    "It's the other member's turn. You'll see their reply under Exchanges.",
  not_author: "Only the member who sent these terms can withdraw them.",
  not_owner: "Only the offer's owner can see its proposals.",
};

const CONFLICT_MESSAGES: Record<string, string> = {
  status_changed:
    "This proposal is already closed. Refresh to see what happened.",
  stale_revision:
    "There are newer terms on this proposal. Refresh to see them.",
  expired: `This proposal expired after ${String(PROPOSAL_LIMITS.expiryDays)} days with no new terms.`,
  already_open: "You already have an open proposal on this offer.",
  offer_unavailable: "This offer is no longer available.",
};

export const FIELD_MESSAGES: Record<string, string> = {
  offer_unavailable: "One of these offers is no longer available.",
  target: ITEM_MESSAGES.getsOneOffer,
  duplicate: ITEM_MESSAGES.duplicate,
  count: `Add 1 to ${String(PROPOSAL_LIMITS.itemsPerSideMax)} items.`,
  text_length: ITEM_MESSAGES.textTooShort,
  too_long: ITEM_MESSAGES.noteTooLong,
  unchanged: "Change an item or the cash. A new note alone isn't new terms.",
  invalid: "This value isn't valid.",
  required: "This is required.",
};

export interface ErrorMessages {
  forbidden: Record<string, string>;
  conflict: Record<string, string>;
  fields: Record<string, string>;
  notFound: string;
  /** Extra detail a CONFLICT passes on. */
  conflictDetail: string[];
}

/** Maps a database function's error (`private.fail`) to an API error with member-facing messages. */
export function errorMapper(messages: ErrorMessages) {
  return (error: PostgrestError): ApiError => {
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
    switch (code) {
      case "VALIDATION_FAILED": {
        const fields = (detail.fields ?? {}) as Record<string, string>;
        return new ApiError(code, {
          fields: Object.fromEntries(
            Object.entries(fields).map(([field, why]) => [
              field,
              messages.fields[why] ?? "This value isn't valid.",
            ]),
          ),
        });
      }
      case "CONFLICT": {
        const key = reason ?? "status_changed";
        const extra: Json = {
          reason: key,
          message: messages.conflict[key] ?? messages.conflict.status_changed,
        };
        for (const name of messages.conflictDetail)
          if (name in detail) extra[name] = detail[name];
        return new ApiError(code, extra);
      }
      case "TERMS_CHANGED":
        return new ApiError(code, { offer_ids: detail.offer_ids ?? [] });
      case "FORBIDDEN":
        return new ApiError(code, {
          ...(reason ? { reason } : {}),
          message: (reason && messages.forbidden[reason]) || "You can't do this.",
        });
      case "NOT_FOUND":
        return new ApiError(code, { message: messages.notFound });
      default:
        return new ApiError(code);
    }
  };
}

const toProposalError = errorMapper({
  forbidden: FORBIDDEN_MESSAGES,
  conflict: CONFLICT_MESSAGES,
  fields: FIELD_MESSAGES,
  notFound: "This proposal isn't available.",
  conflictDetail: ["current_status", "current_revision", "proposal_id"],
});

async function rpc<T>(caller: ApiCaller, fn: string, args: Json): Promise<T> {
  const { data, error } = await caller.client.rpc(fn, args);
  if (error) throw (await contactDetailsError(caller.client, error)) ?? toProposalError(error);
  return data as T;
}

// Views -------------------------------------------------------------

export const roleOf = (row: { proposer: MemberRow }, memberId: string): Role =>
  memberId === row.proposer.id ? "proposer" : "owner";

export function snapshotPaths(revisions: Pick<RevisionRow, "gives" | "gets">[]): string[] {
  const paths = new Set<string>();
  for (const revision of revisions) {
    for (const item of [...revision.gives, ...revision.gets]) {
      if (item.kind === "offer" && item.snapshot.photo) {
        paths.add(item.snapshot.photo.display_path);
        paths.add(item.snapshot.photo.thumb_path);
      }
    }
  }
  return [...paths];
}

export function itemView(
  item: ItemRow,
  links: Map<string, string | null>,
  changed: Set<string>,
) {
  if (item.kind === "text") return item;
  const { photo, ...snapshot } = item.snapshot;
  return {
    kind: item.kind,
    offer_id: item.offer_id,
    content_version: item.content_version,
    changed: changed.has(item.offer_id),
    snapshot: {
      ...snapshot,
      photo: photo
        ? {
            width: photo.width,
            height: photo.height,
            alt_text: photo.alt_text,
            url: links.get(photo.display_path) ?? null,
            thumb_url: links.get(photo.thumb_path) ?? null,
          }
        : null,
    },
  };
}

function revisionView(
  row: { proposer: MemberRow },
  revision: RevisionRow,
  links: Map<string, string | null>,
  changed = new Set<string>(),
) {
  return {
    id: revision.id,
    number: revision.number,
    author: roleOf(row, revision.author_id),
    gives: revision.gives.map((item) => itemView(item, links, changed)),
    gets: revision.gets.map((item) => itemView(item, links, changed)),
    cash: revision.cash,
    note: revision.note,
    created_at: revision.created_at,
  };
}

export type RevisionView = ReturnType<typeof revisionView>;
export type ItemView = RevisionView["gives"][number];

/** The actions the viewer may take, from the shared rules (roles stand in for member ids). */
function actionsFor(
  row: Pick<
    ProposalRow,
    "status" | "expires_at" | "latest_author_id" | "viewer_role" | "proposer"
  >,
): ProposalPermissions {
  return proposalActions(
    {
      status: row.status,
      expires_at: row.expires_at,
      proposer_id: "proposer",
      owner_id: "owner",
      latest_author_id: roleOf(row, row.latest_author_id),
    },
    row.viewer_role,
    new Date(),
  );
}

const turnOf = (
  row: Pick<ProposalRow, "status" | "latest_author_id" | "proposer">,
): Role | null =>
  row.status === "open"
    ? roleOf(row, row.latest_author_id) === "proposer"
      ? "owner"
      : "proposer"
    : null;

export async function proposalView(client: SupabaseClient, row: ProposalRow) {
  const links = await signPaths(client, [
    ...snapshotPaths(row.revisions),
    ...row.gives_choices.flatMap((o) => (o.thumb_path ? [o.thumb_path] : [])),
  ]);
  const changed = new Set(row.changed_offer_ids);
  const latestNumber = row.revision;
  return {
    id: row.id,
    offer_id: row.offer_id,
    status: row.status,
    close_reason: row.close_reason,
    revision: row.revision,
    latest_revision_id: row.latest_revision_id,
    latest_author: roleOf(row, row.latest_author_id),
    turn: turnOf(row),
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at,
    viewer_role: row.viewer_role,
    proposer: { display_name: row.proposer.display_name },
    owner: { display_name: row.owner.display_name },
    offer: row.offer,
    agreement_id: row.agreement_id,
    changed_offer_ids: row.changed_offer_ids,
    actions: actionsFor(row),
    gives_choices: row.gives_choices.map((offer) => ({
      id: offer.id,
      title: offer.title,
      thumb_url: offer.thumb_path
        ? (links.get(offer.thumb_path) ?? null)
        : null,
    })),
    // Only the latest terms can be stale; earlier revisions are history.
    revisions: row.revisions.map((revision) =>
      revisionView(
        row,
        revision,
        links,
        revision.number === latestNumber && row.status === "open"
          ? changed
          : undefined,
      ),
    ),
  };
}
export type ProposalView = Awaited<ReturnType<typeof proposalView>>;

export async function summaryViews(client: SupabaseClient, rows: SummaryRow[]) {
  const links = await signPaths(
    client,
    snapshotPaths(rows.map((row) => row.latest)),
  );
  return rows.map((row) => ({
    id: row.id,
    offer_id: row.offer_id,
    status: row.status,
    close_reason: row.close_reason,
    revision: row.revision,
    latest_author: roleOf(row, row.latest_author_id),
    turn: turnOf(row),
    expires_at: row.expires_at,
    updated_at: row.updated_at,
    viewer_role: row.viewer_role,
    proposer: { display_name: row.proposer.display_name },
    owner: { display_name: row.owner.display_name },
    latest: revisionView(row, row.latest, links),
  }));
}
export type ProposalSummaryView = Awaited<
  ReturnType<typeof summaryViews>
>[number];

// Cursor ------------------------------------------------------------

type Cursor = { updated_at: string; id: string };

export const encodeCursor = (cursor: Cursor | null): string | null =>
  cursor ? Buffer.from(JSON.stringify(cursor)).toString("base64url") : null;

export function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<Cursor>;
    if (
      typeof parsed.updated_at === "string" &&
      typeof parsed.id === "string" &&
      !Number.isNaN(Date.parse(parsed.updated_at))
    ) {
      return { updated_at: parsed.updated_at, id: requireId(parsed.id) };
    }
  } catch {
    // fall through
  }
  throw new ApiError("VALIDATION_FAILED", {
    fields: { cursor: "This page link isn't valid." },
  });
}

// Reads -------------------------------------------------------------

/** Reads for signed-in members only: proposals are never public. */
export async function requireReader(request: Request): Promise<ApiCaller> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  return caller;
}

export async function getProposalFor(caller: ApiCaller, id: string) {
  return proposalView(
    caller.client,
    await rpc<ProposalRow>(caller, "proposal_get", {
      p_proposal_id: requireId(id),
    }),
  );
}

export async function getProposal(
  request: Request,
  id: string,
): Promise<Response> {
  return ok(await getProposalFor(await requireReader(request), id));
}

export async function listProposalsFor(
  caller: ApiCaller,
  box: ProposalBox,
  cursor: string | null = null,
) {
  const position = decodeCursor(cursor);
  const page = await rpc<{ items: SummaryRow[]; next: Cursor | null }>(
    caller,
    "proposal_list",
    {
      p_box: box,
      p_before_updated_at: position?.updated_at ?? null,
      p_before_id: position?.id ?? null,
    },
  );
  return {
    proposals: await summaryViews(caller.client, page.items),
    next_cursor: encodeCursor(page.next),
  };
}

export async function listProposals(request: Request): Promise<Response> {
  const caller = await requireReader(request);
  const params = new URL(request.url).searchParams;
  const box = params.get("box") ?? "turn";
  if (!(PROPOSAL_BOX_IDS as string[]).includes(box)) {
    throw new ApiError("VALIDATION_FAILED", {
      fields: { box: "Choose turn, waiting or closed." },
    });
  }
  return ok(
    await listProposalsFor(caller, box as ProposalBox, params.get("cursor")),
  );
}

/** P5 and A5: proposals and agreements waiting on the viewer (none when signed out). */
export async function waitingCounts(
  caller: ApiCaller,
): Promise<{ turn: number; agreements: number }> {
  if (!caller.user) return { turn: 0, agreements: 0 };
  const { data, error } = await caller.client.rpc("proposal_counts");
  if (error) {
    console.error("Could not count proposals", error);
    return { turn: 0, agreements: 0 };
  }
  return data as { turn: number; agreements: number };
}

export async function offerProposalsFor(caller: ApiCaller, offerId: string) {
  return summaryViews(
    caller.client,
    await rpc<SummaryRow[]>(caller, "offer_proposals", {
      p_offer_id: requireId(offerId),
    }),
  );
}

export async function listOfferProposals(
  request: Request,
  offerId: string,
): Promise<Response> {
  return ok({
    proposals: await offerProposalsFor(await requireReader(request), offerId),
  });
}

// Writes ------------------------------------------------------------

const termsOf = (body: {
  gives: unknown;
  gets: unknown;
  cash: unknown;
  note: string;
}) => ({
  gives: body.gives,
  gets: body.gets,
  cash: body.cash,
  note: body.note,
});

export async function createProposal(request: Request): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const body = await parseBody(request, CreateProposalInputSchema);
  const row = await rpc<ProposalRow>(caller, "proposal_create", {
    p_offer_id: body.offer_id,
    p_terms: termsOf(body),
    p_idempotency_key: key,
  });
  return ok(await proposalView(caller.client, row), 201);
}

export async function counterProposal(
  request: Request,
  id: string,
): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const proposalId = requireId(id);
  const body = await parseBody(request, CounterProposalInputSchema);
  const row = await rpc<ProposalRow>(caller, "proposal_counter", {
    p_proposal_id: proposalId,
    p_expected_revision: body.expected_revision,
    p_terms: termsOf(body),
    p_idempotency_key: key,
  });
  return ok(await proposalView(caller.client, row));
}

export async function acceptProposal(
  request: Request,
  id: string,
): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const proposalId = requireId(id);
  const body = await parseBody(request, AcceptProposalInputSchema);
  const row = await rpc<ProposalRow>(caller, "proposal_accept", {
    p_proposal_id: proposalId,
    p_revision_id: body.revision_id,
    p_idempotency_key: key,
  });
  return ok(await proposalView(caller.client, row));
}

export async function closeProposal(
  request: Request,
  id: string,
  action: "decline" | "withdraw",
): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const proposalId = requireId(id);
  const body = await parseBody(request, ProposalActionInputSchema);
  const row = await rpc<ProposalRow>(caller, `proposal_${action}`, {
    p_proposal_id: proposalId,
    p_expected_revision: body.expected_revision,
    p_idempotency_key: key,
  });
  return ok(await proposalView(caller.client, row));
}
