import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseEnv } from "@/lib/supabase/env";
import { ApiError } from "./respond";

/**
 * Who is calling and a Supabase client acting as them. The web app
 * sends its session cookie; other clients (mobile, tests) send
 * `Authorization: Bearer <access token>`. Either way the client uses
 * the member's own session, never the service key, so row-level
 * security and storage policies apply to every request.
 */
export interface ApiCaller {
  client: SupabaseClient;
  user: User | null;
  via: "bearer" | "cookie";
}

export async function getCaller(request: Request): Promise<ApiCaller> {
  const header = request.headers.get("authorization");
  if (header) {
    const token = /^Bearer (\S+)$/i.exec(header)?.[1];
    if (!token) throw new ApiError("UNAUTHENTICATED");
    const { url, anonKey } = supabaseEnv();
    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) throw new ApiError("UNAUTHENTICATED");
    return { client, user: data.user, via: "bearer" };
  }
  if (!request.headers.get("cookie")) {
    // No credentials at all: a signed-out visitor.
    const { url, anonKey } = supabaseEnv();
    return { client: createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }), user: null, via: "cookie" };
  }
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return { client, user, via: "cookie" };
}

/**
 * For mutations: a signed-in member (401 otherwise). A cookie session
 * is accepted only from this site's own pages (Origin check), so
 * another site cannot act with a visitor's cookies.
 */
export async function requireMember(request: Request): Promise<ApiCaller & { user: User }> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  if (caller.via === "cookie") {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) throw new ApiError("FORBIDDEN", { message: "Request refused." });
  }
  return { ...caller, user: caller.user };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID.test(value);

/** The `Idempotency-Key` header, required on every mutation (400 otherwise). */
export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!isUuid(key)) {
    throw new ApiError("IDEMPOTENCY_KEY_REQUIRED", { message: "Send an Idempotency-Key header with a UUID." });
  }
  return key.toLowerCase();
}

/** A route id that is not a UUID cannot name an offer or photo: 404. */
export function requireId(value: string): string {
  if (!isUuid(value)) throw new ApiError("NOT_FOUND");
  return value.toLowerCase();
}
