import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { WeeklyMealPlan } from '../../types';

export const useMealPlan = (weekStart: string) => {
  const { session } = useAuth();

  return useQuery<WeeklyMealPlan>({
    queryKey: queryKeys.mealPlan.week(weekStart),
    queryFn: async (): Promise<WeeklyMealPlan> => {
      const response = await authFetch(
        `${API_BASE_URL}/api/meal-plan?week_start=${weekStart}`
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
