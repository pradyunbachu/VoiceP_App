/**
 * useShoppingListGroups.ts
 * React Query hook that fetches all shopping list groups the user belongs to.
 * Returns an array of group objects from /api/shopping-list/groups.
 * Uses a 30 s stale time and refetches on mount.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { ShoppingListGroup } from '../../types';

export const useShoppingListGroups = () => {
  const { session } = useAuth();

  return useQuery<ShoppingListGroup[]>({
    queryKey: queryKeys.shoppingList.groups(),
    queryFn: async (): Promise<ShoppingListGroup[]> => {
      const response = await authFetch(`${API_BASE_URL}/api/shopping-list/groups`);

      if (!response.ok) {
        throw new Error('Failed to fetch shopping list groups');
      }

      const data: { groups?: ShoppingListGroup[] } = await response.json();
      return data.groups || [];
    },
    enabled: !!session,
    staleTime: 30000,
    refetchOnMount: true,
  });
};
