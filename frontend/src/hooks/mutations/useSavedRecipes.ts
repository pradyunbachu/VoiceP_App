/**
 * useSavedRecipes.ts
 * Query + mutations for the saved/favorite recipes feature.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { getCsrfHeaders } from '../../lib/csrf';
import { queryKeys } from '../queries/queryKeys';
import type { RecipeDetail } from '../../types';

export interface SavedRecipe extends RecipeDetail {
  id: number;
  saved_at: string;
}

interface SavedRecipesResponse {
  recipes: SavedRecipe[];
  count: number;
}

export const useSavedRecipes = () => {
  const { getToken } = useAuth();

  return useQuery<SavedRecipesResponse>({
    queryKey: [...queryKeys.savedRecipes.all],
    queryFn: async () => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/saved-recipes`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch saved recipes');
      return response.json();
    },
  });
};

export const useSaveRecipe = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<SavedRecipe, Error, RecipeDetail>({
    mutationFn: async (recipe: RecipeDetail): Promise<SavedRecipe> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/saved-recipes`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({
          name: recipe.name,
          description: recipe.description,
          servings: recipe.servings,
          prep_minutes: recipe.prep_minutes,
          cook_minutes: recipe.cook_minutes,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          nutrition: recipe.nutrition,
        }),
      });
      if (response.status === 409) throw new Error('Already saved');
      if (!response.ok) throw new Error('Failed to save recipe');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedRecipes.all });
    },
  });
};

export const useDeleteSavedRecipe = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (id: number) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/saved-recipes/${id}`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to remove recipe');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.savedRecipes.all });
    },
  });
};
