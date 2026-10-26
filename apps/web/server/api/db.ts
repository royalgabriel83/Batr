import type { PostgrestError, SupabaseClient, User } from "@supabase/supabase-js";
import { API_ERROR_STATUS, OFFER_LIMITS, OFFER_TYPE_MESSAGES, PUBLISH_RULE_MESSAGES, SAFETY_FORBIDDEN_MESSAGES, type ApiErrorCode } from "@batr/shared";
import { contactDetailsError } from "./contact";
import { ApiError } from "./respond";
import { offerView, type OfferRow } from "./views";

// Database functions report errors as SQLSTATE PTxxx (HTTP status xxx),
// the API code as the message and a JSON detail (architecture.md 8f).
// This turns them into API errors.

const CONFLICT_MESSAGES = {
  status_changed: "This offer's status has changed. Refresh to see the latest version.",
  stale_revision: "This offer was changed in another window or device. Review the latest version, then save again.",
} as const;

const REASON_MESSAGES: Record<string, string> = {
  too_many: `An offer can have at most ${String(OFFER_LIMITS.photosMax)} photos.`,
  too_long: "This is too long.",
  required: "This is required.",
  // Milestone 9: a field that doesn't fit an item or a service.
  ...OFFER_TYPE_MESSAGES,
};

function fieldMessages(fields: unknown): Record<string, string> | undefined {
  if (Array.isArray(fields)) {
    return Object.fromEntries(
      fields.map((field: string) => [field, PUBLISH_RULE_MESSAGES[field as keyof typeof PUBLISH_RULE_MESSAGES] ?? "This value isn't valid."]),
    );
  }
  if (fields && typeof fields === "object") {
    return Object.fromEntries(
      Object.entries(fields as Record<string, string>).map(([field, reason]) => [field, REASON_MESSAGES[reason] ?? "This value isn't valid."]),
    );
  }
  return undefined;
}

export interface DbErrorContext {
  client: SupabaseClient;
  user: User;
}

/** Converts a function error to an ApiError (unknown errors stay unexpected: 500). */
export async function toApiError(error: PostgrestError, context: DbErrorContext): Promise<ApiError> {
  const code = error.message as ApiErrorCode;
  const isOurs = /^PT\d{3}$/.test(error.code) && code in API_ERROR_STATUS;
  if (!isOurs) {
    console.error("Database error", error);
    return new ApiError("INTERNAL");
  }
  let detail: Record<string, unknown> = {};
  try {
    detail = JSON.parse(error.details) as Record<string, unknown>;
  } catch {
    // no detail
  }
  if (code === "VALIDATION_FAILED") return new ApiError(code, { fields: fieldMessages(detail.fields) ?? {} });
  if (code === "CONFLICT" && detail.reason === "limit_reached") {
    return new ApiError(code, { reason: "limit_reached", message: "You've reached the limit of 1,000. Remove some, then try again." });
  }
  if (code === "CONFLICT") {
    const reason = detail.reason === "stale_revision" ? "stale_revision" : "status_changed";
    const extra: Record<string, unknown> = { reason, message: CONFLICT_MESSAGES[reason] };
    if ("current_status" in detail) extra.current_status = detail.current_status;
    if ("current_revision" in detail) extra.current_revision = detail.current_revision;
    if (detail.offer) extra.offer = await ownerOfferView(context, detail.offer as OfferRow);
    return new ApiError(code, extra);
  }
  if (code === "FORBIDDEN" && detail.reason === "suspended") {
    return new ApiError(code, { reason: "suspended", message: SAFETY_FORBIDDEN_MESSAGES.suspended });
  }
  return new ApiError(code);
}

/** Calls a database function as the member; throws the matching ApiError on failure. */
export async function callFunction<T>(context: DbErrorContext, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await context.client.rpc(fn, args);
  if (error) throw (await contactDetailsError(context.client, error)) ?? (await toApiError(error, context));
  return data as T;
}

/** An offer returned by a write function, as the owner sees it (with their profile and links). */
export async function ownerOfferView(context: DbErrorContext, row: OfferRow) {
  const { data: owner } = await context.client
    .from("profiles")
    .select("display_name, created_at")
    .eq("id", context.user.id)
    .maybeSingle<{ display_name: string | null; created_at: string }>();
  return offerView(context.client, { ...row, owner }, context.user.id);
}
