import { Placeholder } from "@/components/Placeholder";

/**
 * Order history. The backend list (`GET /api/paycrest/orders`) is gated behind
 * a verified SIWE session — i.e. it needs the on-device wallet sign-in that's
 * deferred to the wallet step. So this stays a placeholder until wallet auth
 * lands; then it reads the authenticated wallet's orders.
 */
export function HistoryScreen() {
  return (
    <Placeholder
      title="History"
      subtitle="Your past orders appear here once wallet sign-in is wired — the order list is tied to a verified wallet session (arrives with the wallet step)."
    />
  );
}
