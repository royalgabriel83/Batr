import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";
import { BUCKET } from "@/server/api/views";

// Deletes photo files the database has already queued (a removed photo,
// a deleted draft, an abandoned or replayed upload), right after the
// commit (milestone-1.md, Cleanup). Members cannot delete files, so
// this uses the service key: server only, never in a browser bundle,
// never for reading or writing on a member's behalf. A failure leaves
// the paths queued with the error for the cleanup job; access is
// already blocked at commit either way.

/**
 * Test-only: point the deleter's storage calls at another address (an
 * unreachable one) to test failed deletions. Refused in production.
 */
export const TEST_STORAGE_URL_SETTING = "BATR_TEST_STORAGE_URL";

export function serviceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set (server-only). Run `pnpm env:local`.");
  return key;
}

export function storageUrl(): string {
  const override = process.env[TEST_STORAGE_URL_SETTING];
  if (override) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(`${TEST_STORAGE_URL_SETTING} is a test-only setting and is refused in production.`);
    }
    return override;
  }
  return supabaseEnv().url;
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

export type DeleteOutcome = { deleted: true } | { deleted: false; error: string };

export async function deleteQueuedFiles(requested: string[]): Promise<DeleteOutcome> {
  if (requested.length === 0) return { deleted: true };
  const key = serviceKey();
  const database = createClient(supabaseEnv().url, key, options);
  // Only paths still queued: a file a proposal snapshot keeps was never
  // queued (Milestone 3), and one already deleted was cleared.
  const queued = await database.rpc("storage_cleanup_queued", { p_paths: requested });
  if (queued.error) {
    console.error("Could not read the storage cleanup queue; left for the cleanup job", queued.error);
    return { deleted: false, error: queued.error.message };
  }
  const paths = queued.data as string[];
  if (paths.length === 0) return { deleted: true };
  let failure: string | null = null;
  try {
    const { error } = await createClient(storageUrl(), key, options).storage.from(BUCKET).remove(paths);
    if (error) failure = error.message;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  if (failure === null) {
    const { error } = await database.rpc("storage_cleanup_complete", { p_paths: paths });
    if (error) console.error("Could not clear the storage cleanup queue", error);
    return { deleted: true };
  }
  console.error("Photo files not deleted; left queued for the cleanup job", failure);
  const { error } = await database.rpc("storage_cleanup_failed", { p_paths: paths, p_error: failure });
  if (error) console.error("Could not record the failed deletion", error);
  return { deleted: false, error: failure };
}
