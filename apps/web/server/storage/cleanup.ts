import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "@/lib/supabase/env";
import { BUCKET } from "@/server/api/views";
import { deleteQueuedFiles, serviceKey, storageUrl } from "@/server/storage/deleter";

// The storage cleanup job (milestone-1.md, Cleanup): retries queued
// deletions, deletes orphaned files older than 24 hours, removes
// expired idempotency keys, and records proposals past their expiry
// (milestone-3.md, Expiry). Runs on the server with the service key,
// from /api/internal/storage-cleanup (protected by CRON_SECRET) or
// `pnpm cleanup:storage`. Scheduling it on a host is part of the later
// deployment decision; in development and CI the tests run it.

/** Files with no photo row are deleted once they are older than this. */
export const ORPHAN_AGE = "24 hours";

const BATCH = 100;
const PER_RUN = 500;

export interface CleanupReport {
  queue: { deleted: number; failed: number };
  orphans: { deleted: number; failed: number };
  idempotency_keys: { deleted: number };
  proposals: { expired: number };
  contact_attempts: { deleted: number };
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BATCH) out.push(items.slice(i, i + BATCH));
  return out;
}

export async function runStorageCleanup(): Promise<CleanupReport> {
  const key = serviceKey();
  const database = createClient(supabaseEnv().url, key, options);
  const report: CleanupReport = { queue: { deleted: 0, failed: 0 }, orphans: { deleted: 0, failed: 0 }, idempotency_keys: { deleted: 0 }, proposals: { expired: 0 }, contact_attempts: { deleted: 0 } };

  // 1. Queued deletions. A failure stays queued with its error and one more attempt.
  const pending = await database.rpc("storage_cleanup_pending", { p_limit: PER_RUN });
  if (pending.error) throw pending.error;
  for (const batch of chunks((pending.data as { path: string }[]).map((row) => row.path))) {
    const outcome = await deleteQueuedFiles(batch);
    report.queue[outcome.deleted ? "deleted" : "failed"] += batch.length;
  }

  // 2. Orphaned files. Nothing to record on failure: the next run finds them again.
  const orphans = await database.rpc("storage_orphaned_files", { p_older_than: ORPHAN_AGE, p_limit: PER_RUN });
  if (orphans.error) throw orphans.error;
  const storage = createClient(storageUrl(), key, options).storage.from(BUCKET);
  for (const batch of chunks((orphans.data as { path: string }[]).map((row) => row.path))) {
    try {
      const { error } = await storage.remove(batch);
      if (error) throw error;
      report.orphans.deleted += batch.length;
    } catch (error) {
      console.error("Orphaned photo files not deleted; the next run retries", error instanceof Error ? error.message : error);
      report.orphans.failed += batch.length;
    }
  }

  // 3. Expired idempotency keys.
  const purged = await database.rpc("idempotency_keys_purge");
  if (purged.error) throw purged.error;
  report.idempotency_keys.deleted = purged.data as number;

  // 4. Proposals past their expiry. Every read and action already treats them as expired.
  const expired = await database.rpc("proposal_expire_due");
  if (expired.error) throw expired.error;
  report.proposals.expired = expired.data as number;

  // 5. Contact-detail attempts older than 180 days (milestone-7-contact-details.md, C6).
  const attempts = await database.rpc("contact_attempts_purge");
  if (attempts.error) throw attempts.error;
  report.contact_attempts.deleted = attempts.data as number;

  return report;
}
