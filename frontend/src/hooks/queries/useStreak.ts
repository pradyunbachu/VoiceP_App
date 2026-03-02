import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';
import type { UserStreak } from '../../types';

export const useStreak = () => {
  const { getToken, session } = useAuth();

  return useQuery<UserStreak>({
    queryKey: queryKeys.streak.all,
    queryFn: async (): Promise<UserStreak> => {
      const token = await getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/user/streak`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

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
