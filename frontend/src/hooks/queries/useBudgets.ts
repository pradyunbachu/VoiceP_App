/**
 * useBudgets.ts
 * React Query hook that fetches budget check data for a given month/year.
 * Accepts optional { month, year } filters and returns an array of budget
 * objects from the /api/budgets/check endpoint via useQuery.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';
import type { Budget } from '../../types';

interface BudgetFilters {
  month?: number;
  year?: number;
}

export const useBudgets = (filters: BudgetFilters = {}) => {
  const { getToken, session } = useAuth();
  const { month, year } = filters;

  return useQuery<Budget[]>({
    queryKey: queryKeys.budgets.check(month, year),
    queryFn: async (): Promise<Budget[]> => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const params = new URLSearchParams();
      if (month) params.append('month', String(month));
      if (year) params.append('year', String(year));

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

      const data: { budgets?: Budget[] } = await response.json();
      return data.budgets || [];
    },
    enabled: !!session,
  });
};
