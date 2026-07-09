/**
 * Admin allowlist for the /dashboard analytics view.
 *
 * The dashboard exposes every order under the Paycrest API key — i.e. all
 * users' data — so it is gated to a small set of wallet addresses whose
 * ownership is proven via SIWE (a connected address alone proves nothing; the
 * signature does). The allowlist lives in a server-only env var and is never
 * shipped to the client.
 *
 * Set DASHBOARD_ADMIN_WALLETS to a comma-separated list of addresses, e.g.
 *   DASHBOARD_ADMIN_WALLETS=0xabc...,0xdef...
 */

/** Lower-cased set of allowlisted admin wallet addresses from the env. */
export function adminAddresses(): Set<string> {
  return new Set(
    (process.env.DASHBOARD_ADMIN_WALLETS ?? "")
      .split(",")
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** True when a SIWE-proven address is on the admin allowlist. */
export function isAdminAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  return adminAddresses().has(address.toLowerCase());
}
