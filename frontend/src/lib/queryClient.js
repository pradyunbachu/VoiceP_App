/**
 * queryClient.js — TanStack React Query client configuration.
 * Sets default query options: 2-minute stale time, 10-minute garbage collection,
 * 3 retries with exponential backoff, and refetch on window focus. Mutations
 * retry once on failure.
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 2 minutes
      staleTime: 2 * 60 * 1000,
      // Cache is kept for 10 minutes after component unmount
      gcTime: 10 * 60 * 1000,
      // Retry 3 times with exponential backoff
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 5000),
      // Refetch on window focus for fresh data
      refetchOnWindowFocus: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
});
