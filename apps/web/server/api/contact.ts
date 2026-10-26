import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { CONTACT_DETAILS_MESSAGES } from "@batr/shared";
import { ApiError } from "./respond";

// Milestone 7 (specs/milestone-7-contact-details.md): the database
// refuses text with contact details (CONTACT_DETAILS, 422) and rolls
// back the whole write, so the API records the attempt afterwards (C6,
// C7) and words the refusal for the field it came from.

type Detail = { kind?: string; field?: string; location?: string };

/** The ApiError for a CONTACT_DETAILS refusal, after counting it; null for any other error. */
export async function contactDetailsError(client: SupabaseClient, error: PostgrestError): Promise<ApiError | null> {
  if (error.code !== "PT422" || error.message !== "CONTACT_DETAILS") return null;
  let detail: Detail = {};
  try {
    detail = JSON.parse(error.details) as Detail;
  } catch {
    // no detail
  }
  const { error: recordError } = await client.rpc("contact_attempt_record", { p_location: detail.location, p_kind: detail.kind });
  if (recordError) console.error("Contact attempt not recorded", recordError);
  const field = detail.field ?? "body";
  const message =
    detail.location === "message"
      ? CONTACT_DETAILS_MESSAGES.message
      : detail.location === "display_name"
        ? CONTACT_DETAILS_MESSAGES.display_name
        : CONTACT_DETAILS_MESSAGES.field;
  return new ApiError("CONTACT_DETAILS", { message, kind: detail.kind, fields: { [field]: message } });
}

/** C4: the sender's warning for text that was saved but may hold contact details. */
export async function contactWarning(client: SupabaseClient, location: string, text: string): Promise<string | null> {
  const { data, error } = await client.rpc("contact_warning", { p_location: location, p_text: text });
  if (error) {
    console.error("Contact warning not checked", error);
    return null;
  }
  return data === "ambiguous" ? CONTACT_DETAILS_MESSAGES.warning : null;
}
