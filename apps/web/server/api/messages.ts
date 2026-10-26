import {
  MESSAGE_LIMITS,
  MarkReadInputSchema,
  SAFETY_FORBIDDEN_MESSAGES,
  SendMessageInputSchema,
} from "@batr/shared";
import {
  getCaller,
  requireId,
  requireIdempotencyKey,
  requireMember,
  type ApiCaller,
} from "./auth";
import { parseBody } from "./body";
import { FIELD_MESSAGES, decodeCursor, encodeCursor, errorMapper, type Json } from "./proposals";
import { ApiError, ok } from "./respond";

import type { MessageView, NotificationView, ThreadSummaryView, ThreadView } from "@batr/shared";
import { contactDetailsError, contactWarning } from "./contact";
export type { MessageView, NotificationView, ThreadSummaryView, ThreadView };

// Messages and notifications (specs/milestone-5.md, API). Only the two
// members of a proposal can read or send in its thread; everyone else
// gets 404. The database works out who each line is from ("you",
// "them" or BATR), so no member id leaves the server.

const toMessageError = errorMapper({
  forbidden: SAFETY_FORBIDDEN_MESSAGES,
  conflict: {
    status_changed: "This conversation has changed. Refresh to see the latest.",
    thread_closed: "This conversation is closed.",
  },
  fields: {
    ...FIELD_MESSAGES,
    length: `Write 1 to ${String(MESSAGE_LIMITS.bodyMax)} characters.`,
  },
  notFound: "This conversation isn't available.",
  conflictDetail: [],
});

async function rpc<T>(caller: ApiCaller, fn: string, args: Json = {}): Promise<T> {
  const { data, error } = await caller.client.rpc(fn, args);
  if (error) throw (await contactDetailsError(caller.client, error)) ?? toMessageError(error);
  return data as T;
}

async function requireReader(request: Request): Promise<ApiCaller> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  return caller;
}

/** A message id from the query string, or null when absent. */
function messageId(params: URLSearchParams, name: string): number | null {
  const value = params.get(name);
  if (value === null) return null;
  if (!/^\d{1,15}$/.test(value)) {
    throw new ApiError("VALIDATION_FAILED", { fields: { [name]: "This value isn't valid." } });
  }
  return Number(value);
}

// Threads -----------------------------------------------------------

export function getThreadFor(
  caller: ApiCaller,
  proposalId: string,
  position: { after?: number | null; before?: number | null } = {},
) {
  return rpc<ThreadView>(caller, "message_list", {
    p_proposal_id: requireId(proposalId),
    p_after: position.after ?? null,
    p_before: position.before ?? null,
  });
}

export async function getThread(request: Request, id: string): Promise<Response> {
  const caller = await requireReader(request);
  const params = new URL(request.url).searchParams;
  return ok(
    await getThreadFor(caller, id, {
      after: messageId(params, "after"),
      before: messageId(params, "before"),
    }),
  );
}

export async function sendMessage(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const key = requireIdempotencyKey(request);
  const proposalId = requireId(id);
  const body = await parseBody(request, SendMessageInputSchema);
  const message = await rpc<MessageView>(caller, "message_send", {
    p_proposal_id: proposalId,
    p_body: body.body,
    p_idempotency_key: key,
  });
  const warning = await contactWarning(caller.client, "message", body.body);
  return ok(warning ? { ...message, warning } : message, 201);
}

export async function markThreadRead(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const proposalId = requireId(id);
  const body = await parseBody(request, MarkReadInputSchema);
  return ok(
    await rpc<{ unread: number }>(caller, "message_read", {
      p_proposal_id: proposalId,
      p_up_to: body.up_to,
    }),
  );
}

export async function listThreadsFor(caller: ApiCaller, cursor: string | null = null) {
  const decoded = cursor === null ? null : Buffer.from(cursor, "base64url").toString("utf8");
  if (decoded !== null && !/^\d{1,15}$/.test(decoded)) {
    throw new ApiError("VALIDATION_FAILED", { fields: { cursor: "This value isn't valid." } });
  }
  const before = decoded === null ? null : Number(decoded);
  const page = await rpc<{ items: ThreadSummaryView[]; next: number | null }>(caller, "message_threads", {
    p_before: before,
  });
  return {
    threads: page.items,
    next_cursor: page.next === null ? null : Buffer.from(String(page.next)).toString("base64url"),
  };
}

export async function listThreads(request: Request): Promise<Response> {
  const caller = await requireReader(request);
  return ok(await listThreadsFor(caller, new URL(request.url).searchParams.get("cursor")));
}

/** Unread counts by proposal id, for the Exchanges rows. */
export const unreadCountsFor = (caller: ApiCaller) =>
  rpc<Record<string, number>>(caller, "message_unread_counts");

// Notifications -----------------------------------------------------

export async function listNotificationsFor(caller: ApiCaller, cursor: string | null = null) {
  const position = decodeCursor(cursor);
  const page = await rpc<{
    items: NotificationView[];
    next: { updated_at: string; id: string } | null;
    unread: number;
  }>(caller, "notification_list", {
    p_before_updated_at: position?.updated_at ?? null,
    p_before_id: position?.id ?? null,
  });
  return {
    notifications: page.items,
    unread: page.unread,
    next_cursor: encodeCursor(page.next),
  };
}

export async function listNotifications(request: Request): Promise<Response> {
  const caller = await requireReader(request);
  return ok(await listNotificationsFor(caller, new URL(request.url).searchParams.get("cursor")));
}

export const notificationCountFor = (caller: ApiCaller) =>
  rpc<number>(caller, "notification_count");

export async function notificationCount(request: Request): Promise<Response> {
  return ok({ unread: await notificationCountFor(await requireReader(request)) });
}

export async function readNotification(request: Request, id: string): Promise<Response> {
  const caller = await requireMember(request);
  const unread = await rpc<number>(caller, "notification_read", {
    p_notification_id: requireId(id),
  });
  return ok({ unread });
}

export async function readAllNotifications(request: Request): Promise<Response> {
  const caller = await requireMember(request);
  return ok({ unread: await rpc<number>(caller, "notification_read_all") });
}
