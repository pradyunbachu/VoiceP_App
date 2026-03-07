/**
 * useSpendingComparison.ts
 * React Query hook for month-over-month spending comparison.
 * POSTs two month/year pairs to /api/spending-comparison and returns
 * the comparison breakdown. Includes CSRF headers and uses a 5-minute stale time.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { getCsrfHeaders } from '../../lib/csrf';
import { queryKeys } from './queryKeys';
import type { SpendingComparison } from '../../types';

export const useSpendingComparison = (
  currentMonth: number,
  currentYear: number,
  compareMonth: number,
  compareYear: number
) => {
  const { session } = useAuth();

  return useQuery<SpendingComparison>({
    queryKey: queryKeys.comparison.months(currentMonth, currentYear, compareMonth, compareYear),
    queryFn: async (): Promise<SpendingComparison> => {
      const response = await authFetch(`${API_BASE_URL}/api/spending-comparison`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({
          current_month: currentMonth,
          current_year: currentYear,
          compare_month: compareMonth,
          compare_year: compareYear,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch comparison: ${response.status}`);
      }

      return response.json();
    },
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
