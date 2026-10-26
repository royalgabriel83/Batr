import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError, handle, ok } from "@/server/api/respond";
import { runStorageCleanup } from "@/server/storage/cleanup";

// The storage cleanup job (milestone-1.md, Cleanup). Only a caller with
// CRON_SECRET (server-only) may run it: `Authorization: Bearer <secret>`,
// as a host's scheduler or `pnpm cleanup:storage` sends it. Without a
// configured secret the job cannot be run over HTTP at all.

export const dynamic = "force-dynamic";

const digest = (value: string) => createHash("sha256").update(value).digest();

function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 32) {
    console.error("CRON_SECRET is not set (or shorter than 32 characters); the storage cleanup job refuses every call.");
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  const given = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  // Compared as fixed-length digests, so the time taken says nothing about the secret.
  return timingSafeEqual(digest(given), digest(secret));
}

async function run(request: Request): Promise<Response> {
  if (!hasCronSecret(request)) throw new ApiError("UNAUTHENTICATED", { message: "Not allowed." });
  return ok(await runStorageCleanup());
}

export const POST = (request: Request) => handle(() => run(request));
/** Hosted schedulers usually call with GET. */
export const GET = POST;
