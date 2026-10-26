import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";
import { serviceKey } from "@/server/storage/deleter";

// Flutterwave notifications for platform-fee payments (owner,
// 2026-10-17: Flutterwave is the intended provider). Not operational:
// no Flutterwave account, keys or webhook are configured, and BATR does
// not yet start payments. Until FLUTTERWAVE_WEBHOOK_HASH is set this
// route answers 503 and stores nothing.
//
// When configured, a notification is accepted only if its `verif-hash`
// header equals the secret hash set in the Flutterwave dashboard
// (compared in constant time). It is then stored once per event id,
// keeping only the fields needed to match a payment (no customer name,
// email or phone). Accepted events are not yet applied to fee
// liabilities: Flutterwave's guidance is to confirm each transaction
// with its verify endpoint using the secret key before giving value,
// and that call is not implemented until the account exists.

export const WEBHOOK_HASH_SETTING = "FLUTTERWAVE_WEBHOOK_HASH";

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Notification = { event?: unknown; type?: unknown; data?: Record<string, unknown> };

/** Only what is needed to match the payment later. */
function minimalPayload(body: Notification) {
  const data = body.data ?? {};
  const pick = (key: string) => (typeof data[key] === "string" || typeof data[key] === "number" ? data[key] : null);
  return {
    event: typeof body.event === "string" ? body.event : null,
    data: { id: pick("id"), tx_ref: pick("tx_ref"), flw_ref: pick("flw_ref"), status: pick("status"), amount: pick("amount"), currency: pick("currency") },
  };
}

export async function receiveFlutterwaveEvent(request: Request): Promise<Response> {
  const expected = process.env[WEBHOOK_HASH_SETTING];
  if (!expected) return json({ error: { code: "NOT_CONFIGURED", message: "Payments are not set up." } }, 503);
  const given = request.headers.get("verif-hash") ?? "";
  if (!sameSecret(given, expected)) return json({ error: { code: "UNAUTHENTICATED", message: "Signature refused." } }, 401);
  let body: Notification;
  try {
    body = (await request.json()) as Notification;
  } catch {
    return json({ error: { code: "VALIDATION_FAILED", message: "Send a JSON body." } }, 422);
  }
  const eventId = body.data?.id;
  if (typeof eventId !== "string" && typeof eventId !== "number") {
    return json({ error: { code: "VALIDATION_FAILED", message: "Missing event id." } }, 422);
  }
  const database = createClient(supabaseEnv().url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await database.rpc("payment_provider_event_record", {
    p_provider: "flutterwave",
    p_event_id: String(eventId),
    p_event_type: typeof body.event === "string" ? body.event : typeof body.type === "string" ? body.type : "",
    p_payload: minimalPayload(body),
    p_signature_valid: true,
  });
  if (error) {
    console.error("Could not store a payment notification", error);
    return json({ error: { code: "INTERNAL", message: "Try again." } }, 500);
  }
  return json({ data: { received: true, duplicate: (data as { duplicate: boolean }).duplicate } }, 200);
}
