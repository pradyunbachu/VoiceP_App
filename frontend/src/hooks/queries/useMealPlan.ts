import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { WeeklyMealPlan } from '../../types';

export const useMealPlan = (weekStart: string, groupId?: number) => {
  const { session } = useAuth();

  return useQuery<WeeklyMealPlan>({
    queryKey: queryKeys.mealPlan.week(weekStart, groupId),
    queryFn: async (): Promise<WeeklyMealPlan> => {
      const params = new URLSearchParams({ week_start: weekStart });
      if (groupId) params.set('group_id', String(groupId));

      const response = await authFetch(
        `${API_BASE_URL}/api/meal-plan?${params}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch meal plan');
      }

      return response.json();
    },
    enabled: !!session,
    staleTime: 0,
    refetchOnMount: true,
  });
};
