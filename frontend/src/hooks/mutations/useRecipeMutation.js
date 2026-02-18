/**
 * useRecipeMutation.js
 * React Query mutation for fetching a detailed recipe from /api/recipe-detail.
 * Accepts a meal name, description, and list of available ingredients, then
 * returns AI-generated step-by-step cooking instructions.
 */
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { getCsrfHeaders } from '../../lib/csrf';

export const useRecipeDetail = () => {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ meal_name, meal_description, available_ingredients }) => {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/recipe-detail`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ meal_name, meal_description, available_ingredients }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate recipe');
      }

      return response.json();
    },
  });
};
