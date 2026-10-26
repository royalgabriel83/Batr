// Pages that need a signed-in member. The proxy redirects signed-out
// visitors to sign-in with ?next= so they return afterwards; each page
// also checks for itself, because the proxy is only a first filter.
// An offer's own page (/offers/:id) stays public; creating and editing
// offers does not.

export const PROTECTED_PATHS = ["/account", "/my-offers", "/offers/new", "/moderation"] as const;

const EDIT_PATH = /^\/offers\/[^/]+\/(edit|published)\/?$/;

export function isProtectedPath(pathname: string): boolean {
  return (
    PROTECTED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) || EDIT_PATH.test(pathname)
  );
}
