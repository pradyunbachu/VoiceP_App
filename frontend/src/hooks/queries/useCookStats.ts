import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';
import type { CookStats } from '../../types';

export const useCookStats = () => {
  const { getToken, session } = useAuth();

  return useQuery<CookStats>({
    queryKey: queryKeys.cookStats.all,
    queryFn: async (): Promise<CookStats> => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/cook-stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch cook stats');
      }

      return response.json();
    },
    enabled: !!session,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
};
