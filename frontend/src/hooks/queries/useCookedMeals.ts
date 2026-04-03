/**
 * useCookedMeals.ts
 * React Query hook for fetching cooked meal history via GET /api/cooked-meals.
 * Supports date range filtering and recipe name search.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { CookedMeal } from '../../types';

interface CookedMealsFilters {
  days_back?: number;
  search?: string;
  limit?: number;
}

interface CookedMealsResponse {
  meals: CookedMeal[];
  count: number;
}

export const useCookedMeals = (filters: CookedMealsFilters = {}) => {
  const { session } = useAuth();

  return useQuery<CookedMealsResponse>({
    queryKey: queryKeys.cookedMeals.list(filters),
    queryFn: async (): Promise<CookedMealsResponse> => {
      const params = new URLSearchParams();
      if (filters.days_back) params.append('days_back', String(filters.days_back));
      if (filters.search) params.append('search', filters.search);
      if (filters.limit) params.append('limit', String(filters.limit));

      const url = `${API_BASE_URL}/api/cooked-meals${params.toString() ? '?' + params.toString() : ''}`;
      const response = await authFetch(url);

      if (!response.ok) {
        throw new Error('Failed to fetch cooked meals');
      }

      return response.json();
    },
    enabled: !!session,
  });
};
