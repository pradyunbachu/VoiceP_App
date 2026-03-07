import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { CookStats } from '../../types';

export const useCookStats = () => {
  const { session } = useAuth();

  return useQuery<CookStats>({
    queryKey: queryKeys.cookStats.all,
    queryFn: async (): Promise<CookStats> => {
      const response = await authFetch(`${API_BASE_URL}/api/cook-stats`);

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
