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
  // Optional recipe data for auto-saving (enables "recall past meal")
  recipe_instructions?: string[];
  recipe_description?: string;
  recipe_servings?: number;
  recipe_prep_minutes?: number;
  recipe_cook_minutes?: number;
  recipe_nutrition?: Record<string, unknown>;
}

export const useCookMeal = () => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<CookMealResponse, Error, CookMealVariables>({
    mutationFn: async (vars: CookMealVariables): Promise<CookMealResponse> => {
      const token = await getToken();
      const body: Record<string, unknown> = {
        recipe_name: vars.recipe_name,
        ingredients: vars.ingredients,
      };
      if (vars.group_id) body.group_id = vars.group_id;
      // Pass recipe data for auto-saving
      if (vars.recipe_instructions) body.recipe_instructions = vars.recipe_instructions;
      if (vars.recipe_description) body.recipe_description = vars.recipe_description;
      if (vars.recipe_servings) body.recipe_servings = vars.recipe_servings;
      if (vars.recipe_prep_minutes) body.recipe_prep_minutes = vars.recipe_prep_minutes;
      if (vars.recipe_cook_minutes) body.recipe_cook_minutes = vars.recipe_cook_minutes;
      if (vars.recipe_nutrition) body.recipe_nutrition = vars.recipe_nutrition;

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
