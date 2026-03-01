/**
 * useAnalytics.ts
 * React Query hook that fetches the analytics summary (spending totals,
 * category breakdowns, etc.) from the /api/analytics endpoint.
 * Returns the standard useQuery result. Data is considered stale after 60 s.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';
import type { Analytics } from '../../types';

export const useAnalytics = () => {
  const { getToken, session } = useAuth();

  return useQuery<Analytics>({
    queryKey: queryKeys.analytics.summary(),
    queryFn: async (): Promise<Analytics> => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/analytics`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch analytics: ${response.status}`);
      }

      return response.json();
    },
    enabled: !!session,
    staleTime: 60 * 1000,
  });
};
