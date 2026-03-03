/**
 * useDailyRecs.ts
 * React Query hook that fetches AI-generated daily meal recommendations.
 * Sends the user's timezone to /api/daily-recs so results are date-aware.
 * Uses a 30-minute stale time and disables refetch-on-focus to avoid
 * unnecessary re-generation of recommendations.
 */
import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';
import type { DailyRecs } from '../../types';

export const useDailyRecs = (preference: string = '') => {
  const { getToken, session } = useAuth();
  const refreshRef = useRef(false);

  const query = useQuery<DailyRecs>({
    queryKey: queryKeys.dailyRecs.withPreference(preference),
    queryFn: async (): Promise<DailyRecs> => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const shouldRefresh = refreshRef.current;
      refreshRef.current = false;

      const params = new URLSearchParams({ tz });
      if (shouldRefresh) params.set('refresh', 'true');
      if (preference) params.set('preference', preference);

      const response = await fetch(`${API_BASE_URL}/api/daily-recs?${params}`, {
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

  const refreshRecs = () => {
    refreshRef.current = true;
    query.refetch();
  };

  return { ...query, refreshRecs };
};
