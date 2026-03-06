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

// ── localStorage persistence for offline shopping list ──────────────
const SHOPPING_LIST_CACHE_KEY = 'voxal_shopping_list_cache';

export function persistShoppingList(items: unknown) {
  try {
    localStorage.setItem(SHOPPING_LIST_CACHE_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function loadPersistedShoppingList<T>(): T | null {
  try {
    const raw = localStorage.getItem(SHOPPING_LIST_CACHE_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
