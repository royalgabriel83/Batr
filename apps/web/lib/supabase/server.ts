import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseEnv } from "./env";

/**
 * Supabase client for server components, server actions and route
 * handlers, acting as the signed-in member through their session
 * cookies. Create one per request; never share it.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server components cannot set cookies. The proxy refreshes the
          // session on every request, so nothing is lost here.
        }
      },
    },
  });
}
