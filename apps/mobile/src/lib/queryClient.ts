import { QueryClient } from "@tanstack/react-query";

// Server-state cache (retries + background refetch for order-status polling).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 15_000,
    },
  },
});
