import type { NextConfig } from "next";
import { FIXED_SECURITY_HEADERS } from "./lib/security/headers";

const nextConfig: NextConfig = {
  // packages/shared is published as TypeScript source inside the
  // workspace, so Next.js compiles it with the app.
  transpilePackages: ["@batr/shared"],
  poweredByHeader: false,
  // The Content-Security-Policy is set per request in proxy.ts.
  headers: async () => [{ source: "/:path*", headers: [...FIXED_SECURITY_HEADERS] }],
};

export default nextConfig;
