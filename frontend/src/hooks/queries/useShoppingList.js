import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useShoppingList = (filters = {}) => {
  const { getToken } = useAuth();
  const { category, sort_by = 'created_at', sort_order = 'desc' } = filters;

  return useQuery({
    queryKey: queryKeys.shoppingList.items(filters),
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const params = new URLSearchParams();
      if (category) params.append('category', category);
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

      const data = await response.json();
      return data.items || [];
    },
    enabled: !!getToken(),
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
export const useShoppingPantryMatches = (shoppingItems = [], pantryItems = []) => {
  const { getToken } = useAuth();

  const hasShoppingItems = shoppingItems.length > 0;
  const hasPantryItems = pantryItems.length > 0;

  return useQuery({
    // Include item counts in query key to trigger refetch when lists change
    queryKey: [...queryKeys.shoppingList.pantryMatches(), shoppingItems.length, pantryItems.length],
    queryFn: async () => {
      const token = getToken();
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

      const data = await response.json();
      return data.matches || {};
    },
    enabled: !!getToken() && hasShoppingItems && hasPantryItems,
    // Cache for 30 seconds to avoid too many API calls
    staleTime: 30000,
    refetchOnMount: true,
  });
};
