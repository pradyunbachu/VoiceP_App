import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useExpenses = () => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.expenses.list(),
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/expenses`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch expenses: ${response.status}`);
      }

      const data = await response.json();
      return data.expenses || [];
    },
    enabled: !!getToken(),
  });
};
