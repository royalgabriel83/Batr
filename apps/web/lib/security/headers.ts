// Security headers for every web response (BATR review, roadmap P0 #2).
// The Content-Security-Policy carries a fresh nonce per request, so it is
// set in proxy.ts; the fixed headers are set for every path, static files
// included, in next.config.ts.

/** Headers that are the same on every response. */
export const FIXED_SECURITY_HEADERS: ReadonlyArray<{ key: string; value: string }> = [
  // Browsers only honour this over HTTPS, so it's harmless locally.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Older browsers that don't read frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** A random nonce for one response's scripts. */
export function newNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * The page policy. Scripts run only with this response's nonce (Next.js
 * adds it to its own scripts); photos come from Supabase Storage links and
 * local previews (blob:). The browser talks only to BATR's own API.
 */
export function contentSecurityPolicy(nonce: string, supabaseUrl: string, dev: boolean): string {
  const storage = new URL(supabaseUrl).origin;
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // React style attributes and next/font need inline styles.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${storage}`,
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (storage.startsWith("https:")) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
