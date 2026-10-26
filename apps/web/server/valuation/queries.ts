import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { MemberValuation, QueueRow, ReviewValuation } from "@/lib/valuation/types";
import type { ValuationSummaryData } from "@/components/valuation/ValuationSummary";

// Server-side reads for the valuation pages, with the member's own
// session (the database functions decide what each viewer may see).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The owner's latest valuation of their offer; null if none. Throws on unexpected errors. */
export async function loadOwnValuation(offerId: string): Promise<MemberValuation | null> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("valuation_for_offer", { p_offer_id: offerId });
  if (error) throw new Error(`valuation_for_offer: ${error.message}`);
  return data as MemberValuation | null;
}

/**
 * BATR's latest approved value for an offer the viewer can see, or null.
 * Signed-in members only (owner, 2026-10-18): the database refuses
 * signed-out callers, so never call this for a visitor.
 */
export async function loadValuationSummary(offerId: string): Promise<ValuationSummaryData | null> {
  if (!UUID.test(offerId)) return null;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("offer_valuation_summary", { p_offer_id: offerId });
  if (error) {
    console.error("Valuation summary could not be loaded", error);
    return null;
  }
  return data as ValuationSummaryData | null;
}

/** For signed-out visitors: only whether BATR assessed this active offer, with no amount or detail. */
export async function loadAssessmentIndicator(offerId: string): Promise<boolean> {
  if (!UUID.test(offerId)) return false;
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("offer_assessment_indicator", { p_offer_id: offerId });
  if (error) {
    console.error("Assessment indicator could not be loaded", error);
    return false;
  }
  return data === true;
}

/** The review queue, or null when the viewer isn't BATR staff. */
export async function loadReviewQueue(status: string | null): Promise<QueueRow[] | null> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("review_queue", { p_status: status });
  if (error) {
    if (error.code === "PT403") return null;
    throw new Error(`review_queue: ${error.message}`);
  }
  return data as QueueRow[];
}

export type ReviewLookup = { kind: "ok"; valuation: ReviewValuation } | { kind: "forbidden" } | { kind: "missing" } | { kind: "own" };

export async function loadReview(id: string): Promise<ReviewLookup> {
  if (!UUID.test(id)) return { kind: "missing" };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.rpc("review_get", { p_submission_id: id });
  if (!error) return { kind: "ok", valuation: data as ReviewValuation };
  if (error.code === "PT404") return { kind: "missing" };
  if (error.code === "PT403") return error.details.includes("own_submission") ? { kind: "own" } : { kind: "forbidden" };
  throw new Error(`review_get: ${error.message}`);
}
