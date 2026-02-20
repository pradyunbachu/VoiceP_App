/**
 * useBudgets.js
 * React Query hook that fetches budget check data for a given month/year.
 * Accepts optional { month, year } filters and returns an array of budget
 * objects from the /api/budgets/check endpoint via useQuery.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useBudgets = (filters = {}) => {
  const { getToken, session } = useAuth();
  const { month, year } = filters;

  return useQuery({
    queryKey: queryKeys.budgets.check(month, year),
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const params = new URLSearchParams();
      if (month) params.append('month', month);
      if (year) params.append('year', year);

      const url = `${API_BASE_URL}/api/budgets/check${params.toString() ? '?' + params.toString() : ''}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch budgets');
      }

      const data = await response.json();
      return data.budgets || [];
    },
    enabled: !!session,
  });
};
