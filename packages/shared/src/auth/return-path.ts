// Where to send a member after sign-in or email confirmation. Only
// same-site paths are accepted, so a crafted ?next= cannot redirect a
// member to another site (open redirect).

export const DEFAULT_RETURN_PATH = "/account";

/** Pages that would loop back into the sign-in flow. */
const AUTH_PATHS = ["/sign-in", "/sign-up", "/auth"];

export function safeReturnPath(next: string | null | undefined): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//")) return DEFAULT_RETURN_PATH;
  // Browsers turn a backslash into "/" and drop tabs and newlines, so
  // "/<backslash>x" or "/<tab>/x" would become "//x", another site. With
  // those refused, a path starting with a single "/" stays on this site.
  if (next.includes("\\") || [...next].some((char) => char <= "\u001f" || char === "\u007f")) return DEFAULT_RETURN_PATH;
  const pathname = next.replace(/[?#].*$/s, "");
  if (AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return DEFAULT_RETURN_PATH;
  return next;
}

/** The sign-in URL that returns to `path` afterwards. */
export function signInPathFor(path: string): string {
  return `/sign-in?next=${encodeURIComponent(safeReturnPath(path))}`;
}
