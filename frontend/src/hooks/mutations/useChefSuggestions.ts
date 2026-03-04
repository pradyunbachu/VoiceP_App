/**
 * useChefSuggestions.ts
 * React Query mutation for generating recipe suggestions from selected
 * ingredients via POST /api/chef/suggestions.
 */
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { getCsrfHeaders } from '../../lib/csrf';
import type { MealSuggestion } from '../../types';

interface ChefSuggestionsVariables {
  ingredients: string[];
  preference?: string;
}

interface ChefSuggestionsResponse {
  meals: MealSuggestion[];
}

export const useChefSuggestions = () => {
  const { getToken } = useAuth();

  return useMutation<ChefSuggestionsResponse, Error, ChefSuggestionsVariables>({
    mutationFn: async ({ ingredients, preference = '' }: ChefSuggestionsVariables): Promise<ChefSuggestionsResponse> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/chef/suggestions`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ ingredients, preference }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to generate suggestions');
      }

      return response.json();
    },
  });
};
