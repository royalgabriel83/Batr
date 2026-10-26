import type { SupabaseClient } from "@supabase/supabase-js";
import { requireId, requireMember, getCaller } from "./auth";
import { callFunction } from "./db";
import { ApiError, ok } from "./respond";
import { OFFER_SELECT, offerSummaries, type OfferRow } from "./views";

// Likes and saved offers (owner, 2026-10-17). Both are private to the
// member and never notify anyone. Setting and clearing are naturally
// repeatable (doing it twice changes nothing), so unlike the offer
// changes they need no Idempotency-Key. The database function decides
// what may be liked or saved (active, readable, not your own).

export type MarkKind = "like" | "save";

export async function setMark(request: Request, offerId: string, kind: MarkKind, on: boolean): Promise<Response> {
  const caller = await requireMember(request);
  const id = requireId(offerId);
  const result = await callFunction<{ offer_id: string; on: boolean }>(
    caller,
    kind === "save" ? "offer_set_saved" : "offer_set_liked",
    kind === "save" ? { p_offer_id: id, p_saved: on } : { p_offer_id: id, p_liked: on },
  );
  return ok(kind === "save" ? { offer_id: result.offer_id, saved: result.on } : { offer_id: result.offer_id, liked: result.on });
}

export const SAVED_PAGE_SIZE = 20;

const SAVED_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

function decodeSavedCursor(cursor: string): { savedAt: string; offerId: string } {
  try {
    const [savedAt, offerId] = JSON.parse(Buffer.from(cursor, "base64url").toString()) as [unknown, unknown];
    if (typeof savedAt === "string" && SAVED_TIME.test(savedAt) && typeof offerId === "string" && /^[0-9a-f-]{36}$/.test(offerId)) {
      return { savedAt, offerId };
    }
  } catch {
    // fall through
  }
  throw new ApiError("VALIDATION_FAILED", { fields: { cursor: "This page link is no longer valid." } });
}

interface SaveRow {
  offer_id: string;
  created_at: string;
  offer: OfferRow | null;
}

/**
 * One page of the member's saved offers, newest saved first. Read with
 * the member's session: an offer they can no longer read (paused or
 * closed by its owner) comes back as `offer: null`, so the page can say
 * it isn't available without revealing why.
 */
export async function readSaved(client: SupabaseClient, memberId: string, cursor: string | null) {
  let query = client
    .from("offer_saves")
    .select(`offer_id, created_at, offer:offers(${OFFER_SELECT})`)
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .order("offer_id", { ascending: false })
    .limit(SAVED_PAGE_SIZE + 1);
  if (cursor) {
    const { savedAt, offerId } = decodeSavedCursor(cursor);
    query = query.or(`created_at.lt."${savedAt}",and(created_at.eq."${savedAt}",offer_id.lt.${offerId})`);
  }
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as unknown as SaveRow[]).slice(0, SAVED_PAGE_SIZE);
  // A readable but no longer active offer only reaches its own owner, who can't save it; checked anyway.
  const readable = rows.map((row) => (row.offer && row.offer.status === "active" ? row.offer : null));
  const summaries = await offerSummaries(client, readable.filter((o): o is OfferRow => o !== null), memberId);
  const byId = new Map(summaries.map((s) => [s.id, s]));
  const last = rows.at(-1);
  return {
    items: rows.map((row, i) => ({
      offer_id: row.offer_id,
      saved_at: row.created_at,
      offer: readable[i] ? (byId.get(row.offer_id) ?? null) : null,
    })),
    next_cursor:
      (data as unknown[]).length > SAVED_PAGE_SIZE && last
        ? Buffer.from(JSON.stringify([last.created_at, last.offer_id])).toString("base64url")
        : null,
  };
}

export async function listSaved(request: Request): Promise<Response> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  return ok(await readSaved(caller.client, caller.user.id, new URL(request.url).searchParams.get("cursor")));
}
