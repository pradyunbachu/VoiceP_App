/**
 * useSpendingInsights.js
 * React Query hook for AI-powered spending insights.
 * POSTs a time period (e.g. "last_30_days") to /api/insights and returns
 * the generated report. Uses CSRF headers and a 5-minute stale time to
 * avoid frequent re-generation of the AI analysis.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { getCsrfHeaders } from '../../lib/csrf';
import { queryKeys } from './queryKeys';

export const useSpendingInsights = (timePeriod = 'last_30_days') => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.insights.report(timePeriod),
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/insights`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }),
        credentials: 'include',
        body: JSON.stringify({ time_period: timePeriod }),
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch insights: ${response.status}`);
      }

      return response.json();
    },
    enabled: !!getToken(),
    staleTime: 5 * 60 * 1000, // 5 minutes - insights don't need constant refresh
    refetchOnWindowFocus: false,
  });
};
