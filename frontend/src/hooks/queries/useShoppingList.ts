/**
 * useShoppingList.ts
 * React Query hooks for the shopping list feature.
 * - useShoppingList: fetches shopping list items with category/group/sort filters.
 *   Persists data to localStorage for offline access.
 * - useShoppingPantryMatches: POST-based query that uses AI to semantically match
 *   shopping list items against pantry items, cached for 30 s.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePantrySelection } from '../../context/PantryContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import { persistShoppingList, loadPersistedShoppingList } from '../../lib/queryClient';
import type { ShoppingListItem, PantryItem, PantryMatch } from '../../types';

interface ShoppingListFilters {
  category?: string;
  group_id?: string | number;
  sort_by?: string;
  sort_order?: string;
}

// ── Online status hook ──────────────────────────────────────────────

function subscribe(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
const getSnapshot = () => navigator.onLine;

export const useOnlineStatus = () => useSyncExternalStore(subscribe, getSnapshot);

// ── Shopping list query ─────────────────────────────────────────────

export const useShoppingList = (filters: ShoppingListFilters = {}) => {
  const { session } = useAuth();
  const { category, group_id, sort_by = 'created_at', sort_order = 'desc' } = filters;
  const isOnline = useOnlineStatus();

  // Seed initialData from localStorage so the list renders instantly / offline
  const cachedItems = loadPersistedShoppingList<ShoppingListItem[]>();

  const query = useQuery<ShoppingListItem[]>({
    queryKey: queryKeys.shoppingList.items(filters),
    queryFn: async (): Promise<ShoppingListItem[]> => {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (group_id) params.append('group_id', String(group_id));
      params.append('sort_by', sort_by);
      params.append('sort_order', sort_order);

      const response = await authFetch(`${API_BASE_URL}/api/shopping-list?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch shopping list');
      }

      const data: { items?: ShoppingListItem[] } = await response.json();
      return data.items || [];
    },
    enabled: !!session && isOnline,
    // Use cached data as placeholder so the list shows immediately
    placeholderData: cachedItems ?? undefined,
    // Don't cache shopping list aggressively - always refetch when component mounts
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Persist to localStorage whenever we get fresh server data
  useEffect(() => {
    if (query.data && query.data !== cachedItems) {
      persistShoppingList(query.data);
    }
  }, [query.data]);

  return query;
};

/**
 * Hook to fetch semantic matches between shopping list items and pantry items.
 * Uses AI to match items even when names are in different order or have variations.
 */
export const useShoppingPantryMatches = (
  shoppingItems: ShoppingListItem[] = [],
  pantryItems: PantryItem[] = []
) => {
  const { session } = useAuth();
  const isOnline = useOnlineStatus();
  const { selectedGroupId } = usePantrySelection();

  const hasShoppingItems = shoppingItems.length > 0;
  const hasPantryItems = pantryItems.length > 0;

  return useQuery<Record<string, PantryMatch>>({
    // Include item counts + selected pantry in the key so it refetches on change
    queryKey: [...queryKeys.shoppingList.pantryMatches(), shoppingItems.length, pantryItems.length, selectedGroupId],
    queryFn: async (): Promise<Record<string, PantryMatch>> => {
      // match-pantry scopes the pantry side by group_id (query param on the endpoint).
      const qs = selectedGroupId != null ? `?group_id=${selectedGroupId}` : '';
      const response = await authFetch(`${API_BASE_URL}/api/shopping-list/match-pantry${qs}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch pantry matches');
      }

      const data: { matches?: Record<string, PantryMatch> } = await response.json();
      return data.matches || {};
    },
    enabled: !!session && isOnline && hasShoppingItems && hasPantryItems,
    // Cache for 30 seconds to avoid too many API calls
    staleTime: 30000,
    refetchOnMount: true,
  });
};
