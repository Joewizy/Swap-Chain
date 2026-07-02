import { QueryClient } from "@tanstack/react-query";

/**
 * Server-state cache. Order-status polling (deposit → bridge → payout) will
 * lean on this in Phase 2 — retries and background refetch out of the box.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 15_000,
    },
  },
});
