import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 3,
      retryDelay: (attemptIndex: number) => Math.min(1000 * (attemptIndex + 1), 5000),
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
