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
import type { CookMealResponse } from '../../types';

interface CookMealVariables {
  recipe_name: string;
  ingredients: Array<{ item: string; amount: string }>;
}

export const useCookMeal = () => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<CookMealResponse, Error, CookMealVariables>({
    mutationFn: async ({ recipe_name, ingredients }: CookMealVariables): Promise<CookMealResponse> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/cook-meal`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ recipe_name, ingredients }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to record meal');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.cookStats.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dailyRecs.all });
    },
  });
};
