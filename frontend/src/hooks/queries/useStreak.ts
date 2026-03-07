import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { UserStreak } from '../../types';

export const useStreak = () => {
  const { session } = useAuth();

  return useQuery<UserStreak>({
    queryKey: queryKeys.streak.all,
    queryFn: async (): Promise<UserStreak> => {
      const response = await authFetch(`${API_BASE_URL}/api/user/streak`);

      if (!response.ok) {
        throw new Error('Failed to fetch streak');
      }

      return response.json();
    },
    enabled: !!session,
    staleTime: 2 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
};
