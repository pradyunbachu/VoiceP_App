/**
 * useDailyRecs.js
 * React Query hook that fetches AI-generated daily meal recommendations.
 * Sends the user's timezone to /api/daily-recs so results are date-aware.
 * Uses a 30-minute stale time and disables refetch-on-focus to avoid
 * unnecessary re-generation of recommendations.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useDailyRecs = () => {
  const { getToken, session } = useAuth();

  return useQuery({
    queryKey: queryKeys.dailyRecs.all,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const response = await fetch(`${API_BASE_URL}/api/daily-recs?tz=${encodeURIComponent(tz)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch daily recs: ${response.status}`);
      }

      return response.json();
    },
    enabled: !!session,
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
};
