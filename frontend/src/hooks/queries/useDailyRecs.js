import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useDailyRecs = () => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.dailyRecs.all,
    queryFn: async () => {
      const token = getToken();
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
    enabled: !!getToken(),
    staleTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
  });
};
