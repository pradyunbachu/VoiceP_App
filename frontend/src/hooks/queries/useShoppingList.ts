/**
 * useShoppingList.ts
 * React Query hooks for the shopping list feature.
 * - useShoppingList: fetches shopping list items with category/group/sort filters.
 *   Uses staleTime=0 and aggressive refetch to keep the list fresh.
 * - useShoppingPantryMatches: POST-based query that uses AI to semantically match
 *   shopping list items against pantry items, cached for 30 s.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';
import type { ShoppingListItem, PantryItem, PantryMatch } from '../../types';

interface ShoppingListFilters {
  category?: string;
  group_id?: string | number;
  sort_by?: string;
  sort_order?: string;
}

export const useShoppingList = (filters: ShoppingListFilters = {}) => {
  const { getToken, session } = useAuth();
  const { category, group_id, sort_by = 'created_at', sort_order = 'desc' } = filters;

  return useQuery<ShoppingListItem[]>({
    queryKey: queryKeys.shoppingList.items(filters),
    queryFn: async (): Promise<ShoppingListItem[]> => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (group_id) params.append('group_id', String(group_id));
      params.append('sort_by', sort_by);
      params.append('sort_order', sort_order);

      const response = await fetch(`${API_BASE_URL}/api/shopping-list?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch shopping list');
      }

      const data: { items?: ShoppingListItem[] } = await response.json();
      return data.items || [];
    },
    enabled: !!session,
    // Don't cache shopping list aggressively - always refetch when component mounts
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
};

/**
 * Hook to fetch semantic matches between shopping list items and pantry items.
 * Uses AI to match items even when names are in different order or have variations.
 */
export const useShoppingPantryMatches = (
  shoppingItems: ShoppingListItem[] = [],
  pantryItems: PantryItem[] = []
) => {
  const { getToken, session } = useAuth();

  const hasShoppingItems = shoppingItems.length > 0;
  const hasPantryItems = pantryItems.length > 0;

  return useQuery<Record<string, PantryMatch>>({
    // Include item counts in query key to trigger refetch when lists change
    queryKey: [...queryKeys.shoppingList.pantryMatches(), shoppingItems.length, pantryItems.length],
    queryFn: async (): Promise<Record<string, PantryMatch>> => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/shopping-list/match-pantry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch pantry matches');
      }

      const data: { matches?: Record<string, PantryMatch> } = await response.json();
      return data.matches || {};
    },
    enabled: !!session && hasShoppingItems && hasPantryItems,
    // Cache for 30 seconds to avoid too many API calls
    staleTime: 30000,
    refetchOnMount: true,
  });
};
