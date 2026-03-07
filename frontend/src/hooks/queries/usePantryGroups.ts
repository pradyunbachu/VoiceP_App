/**
 * usePantryGroups.ts
 * React Query hook that fetches all pantry groups the user belongs to.
 * Returns an array of group objects from /api/pantry/groups.
 * Uses a 30 s stale time and refetches on mount.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { PantryGroup } from '../../types';

export const usePantryGroups = () => {
  const { session } = useAuth();

  return useQuery<PantryGroup[]>({
    queryKey: queryKeys.pantry.groups(),
    queryFn: async (): Promise<PantryGroup[]> => {
      const response = await authFetch(`${API_BASE_URL}/api/pantry/groups`);

      if (!response.ok) {
        throw new Error('Failed to fetch pantry groups');
      }

      const data: { groups?: PantryGroup[] } = await response.json();
      return data.groups || [];
    },
    enabled: !!session,
    staleTime: 30000,
    refetchOnMount: true,
  });
};
