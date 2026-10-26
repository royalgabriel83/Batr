import { DisplayNameInputSchema } from "@batr/shared";
import { getCaller, requireMember, type ApiCaller } from "./auth";
import { parseBody } from "./body";
import { ApiError, ok } from "./respond";
import { contactDetailsError } from "./contact";

// The member's own profile, for the mobile app's Account tab
// (specs/milestone-2.md, unit 10). The web sets the display name with
// a server action; both go through the same database function. Setting
// a name twice gives the same result, so no Idempotency-Key is needed.

export interface ProfileView {
  display_name: string | null;
  email: string;
  /** "YYYY-MM", as on offers. */
  member_since: string;
}

async function profileFor(caller: ApiCaller & { user: NonNullable<ApiCaller["user"]> }): Promise<ProfileView> {
  const { data, error } = await caller.client
    .from("profiles")
    .select("display_name, created_at")
    .eq("id", caller.user.id)
    .maybeSingle<{ display_name: string | null; created_at: string }>();
  if (error) throw error;
  return {
    display_name: data?.display_name ?? null,
    email: caller.user.email ?? "",
    member_since: (data?.created_at ?? caller.user.created_at).slice(0, 7),
  };
}

export async function getProfile(request: Request): Promise<Response> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  return ok(await profileFor({ ...caller, user: caller.user }));
}

export async function setProfile(request: Request): Promise<Response> {
  const caller = await requireMember(request);
  const body = await parseBody(request, DisplayNameInputSchema);
  const { error } = await caller.client.rpc("profile_set_display_name", { p_display_name: body.display_name });
  if (error) {
    if (error.code === "PT401") throw new ApiError("UNAUTHENTICATED");
    const refused = await contactDetailsError(caller.client, error);
    if (refused) throw refused;
    console.error("Display name not saved", error);
    throw new ApiError("INTERNAL");
  }
  return ok(await profileFor(caller));
}
