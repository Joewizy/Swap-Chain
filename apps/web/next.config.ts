import type { NextConfig } from "next";

/**
 * Baseline security headers. A wallet-signing finance UI is a prime
 * clickjacking target, so framing is denied outright (X-Frame-Options +
 * CSP frame-ancestors). The CSP is intentionally scoped to framing only — a
 * full default-src/script-src/connect-src policy can break WalletConnect and
 * the RPC providers, so that is a separate, tested follow-up.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  // @railglide/shared ships TypeScript source (no build step), so Next must
  // transpile it like first-party code.
  transpilePackages: ["@railglide/shared"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
