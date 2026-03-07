/**
 * useSpendingInsights.ts
 * React Query hook for AI-powered spending insights.
 * POSTs a time period (e.g. "last_30_days") to /api/insights and returns
 * the generated report. Uses CSRF headers and a 5-minute stale time to
 * avoid frequent re-generation of the AI analysis.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { getCsrfHeaders } from '../../lib/csrf';
import { queryKeys } from './queryKeys';
import type { SpendingInsights } from '../../types';

export const useSpendingInsights = (timePeriod: string = 'last_30_days') => {
  const { session } = useAuth();

  return useQuery<SpendingInsights>({
    queryKey: queryKeys.insights.report(timePeriod),
    queryFn: async (): Promise<SpendingInsights> => {
      const response = await authFetch(`${API_BASE_URL}/api/insights`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({ time_period: timePeriod }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch insights: ${response.status}`);
      }

      return response.json();
    },
    enabled: !!session,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
