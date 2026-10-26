// Public Supabase settings for the web app. Read when a request needs
// them (not at import time), so `next build` works without a database.
// The service-role key is never read here: member requests always use
// the member's own session (architecture.md, invariant 8).

export function supabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. Start local Supabase and run `pnpm env:local`.",
    );
  }
  return { url, anonKey };
}
