import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useShoppingListGroups = () => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.shoppingList.groups(),
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/shopping-list/groups`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch shopping list groups');
      }

      const data = await response.json();
      return data.groups || [];
    },
    enabled: !!getToken(),
    staleTime: 30000,
    refetchOnMount: true,
  });
};
