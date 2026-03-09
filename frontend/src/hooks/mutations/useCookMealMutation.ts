/**
 * useCookMealMutation.ts
 * React Query mutation for recording a cooked meal via POST /api/cook-meal.
 * Deducts pantry ingredients and returns waste-prevention stats.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { getCsrfHeaders } from '../../lib/csrf';
import { queryKeys } from '../queries/queryKeys';
import type { CookMealResponse, CookStats } from '../../types';

interface CookMealVariables {
  recipe_name: string;
  ingredients: Array<{ item: string; amount: string }>;
  group_id?: number;
}

export const useCookMeal = () => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<CookMealResponse, Error, CookMealVariables>({
    mutationFn: async ({ recipe_name, ingredients, group_id }: CookMealVariables): Promise<CookMealResponse> => {
      const token = await getToken();
      const body: Record<string, unknown> = { recipe_name, ingredients };
      if (group_id) body.group_id = group_id;

      const response = await fetch(`${API_BASE_URL}/api/cook-meal`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to record meal');
      }

      return response.json();
    },
    onSuccess: (result) => {
      // Optimistically update cook stats cache so the meal appears
      // immediately on the Home dashboard without waiting for a refetch
      queryClient.setQueryData<CookStats>(queryKeys.cookStats.all, (old) => {
        const newMeal = {
          recipe_name: result.recipe_name,
          cooked_at: new Date().toISOString(),
        };
        if (!old) {
          return {
            week_meals_cooked: 1,
            week_expiring_saved: result.expiring_items_saved,
            week_estimated_savings: result.estimated_savings,
            recent_meals: [newMeal],
          };
        }
        return {
          ...old,
          week_meals_cooked: old.week_meals_cooked + 1,
          week_expiring_saved: old.week_expiring_saved + result.expiring_items_saved,
          week_estimated_savings: old.week_estimated_savings + result.estimated_savings,
          recent_meals: [newMeal, ...old.recent_meals].slice(0, 5),
        };
      });

      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cookStats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyRecs.all });
    },
  });
};
