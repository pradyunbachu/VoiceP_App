/**
 * useBudgets.ts
 * React Query hook that fetches budget check data for a given month/year.
 * Accepts optional { month, year } filters and returns an array of budget
 * objects from the /api/budgets/check endpoint via useQuery.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { Budget } from '../../types';

interface BudgetFilters {
  month?: number;
  year?: number;
}

export const useBudgets = (filters: BudgetFilters = {}) => {
  const { session } = useAuth();
  const { month, year } = filters;

  return useQuery<Budget[]>({
    queryKey: queryKeys.budgets.check(month, year),
    queryFn: async (): Promise<Budget[]> => {
      const params = new URLSearchParams();
      if (month) params.append('month', String(month));
      if (year) params.append('year', String(year));

      const url = `${API_BASE_URL}/api/budgets/check${params.toString() ? '?' + params.toString() : ''}`;

      const response = await authFetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch budgets');
      }

      const data: { budgets?: Budget[] } = await response.json();
      return data.budgets || [];
    },
    enabled: !!session,
  });
};
