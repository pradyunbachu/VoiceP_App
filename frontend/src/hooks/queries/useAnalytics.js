/**
 * useAnalytics.js
 * React Query hook that fetches the analytics summary (spending totals,
 * category breakdowns, etc.) from the /api/analytics endpoint.
 * Returns the standard useQuery result. Data is considered stale after 60 s.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useAnalytics = () => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.analytics.summary(),
    queryFn: async () => {
      const token = getToken();
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
    enabled: !!getToken(),
    staleTime: 60 * 1000,
  });
};
