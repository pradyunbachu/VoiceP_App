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
