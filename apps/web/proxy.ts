import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { signInPathFor } from "@batr/shared";
import { isProtectedPath } from "@/lib/auth/routes";
import { contentSecurityPolicy, newNonce } from "@/lib/security/headers";
import { supabaseEnv } from "@/lib/supabase/env";

/**
 * Runs before every page: refreshes the member's session cookies (so
 * server components see a valid session) and sends signed-out visitors
 * from protected pages to sign-in, remembering where they were going.
 * It also sets the page's Content-Security-Policy with a fresh nonce;
 * Next.js reads it from the request and adds the nonce to its scripts.
 */
export async function proxy(request: NextRequest) {
  const { url, anonKey } = supabaseEnv();
  const csp = contentSecurityPolicy(newNonce(), url, process.env.NODE_ENV === "development");
  request.headers.set("Content-Security-Policy", csp);
  const next = () => NextResponse.next({ request: { headers: request.headers } });
  let response = next();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, headers) => {
        for (const { name, value } of toSet) request.cookies.set(name, value);
        response = next();
        for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // getUser() checks the token with Supabase Auth (and refreshes it when
  // needed); a cookie alone is never trusted.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtectedPath(request.nextUrl.pathname)) {
    const target = new URL(signInPathFor(`${request.nextUrl.pathname}${request.nextUrl.search}`), request.url);
    const redirect = NextResponse.redirect(target);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Content-Security-Policy", csp);
    return redirect;
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // Everything except static files, image optimisation and public assets.
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/).*)",
  ],
};
