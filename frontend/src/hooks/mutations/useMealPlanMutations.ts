import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';
import type { PlannedMeal, WeeklyMealPlan, DayOfWeek, MealSlot, ShoppingListItem } from '../../types';

interface CreatePlannedMealData {
  day: DayOfWeek;
  slot: MealSlot;
  recipe_name: string;
  description?: string;
  time_minutes?: number;
  ingredients?: Array<{ item: string; amount: string }>;
  week_start: string;
}

export const useCreatePlannedMeal = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<PlannedMeal, Error, CreatePlannedMealData>({
    mutationFn: async (data) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/meal-plan`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create planned meal');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan.all });
    },
  });
};

export const useDeletePlannedMeal = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (id) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/meal-plan/${id}`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete planned meal');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan.all });
    },
  });
};

interface GenerateMealPlanData {
  week_start: string;
  preferences?: string;
  group_id?: number;
}

export const useGenerateMealPlan = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<WeeklyMealPlan, Error, GenerateMealPlanData>({
    mutationFn: async (data) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/meal-plan/generate`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate meal plan');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan.all });
    },
  });
};

interface ReplaceMealData {
  meal_id: number;
  week_start: string;
  group_id?: number;
}

export const useReplaceMeal = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<PlannedMeal, Error, ReplaceMealData>({
    mutationFn: async (data) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/meal-plan/replace-meal`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to replace meal');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan.all });
    },
  });
};

interface SwapMealsData {
  source_day: DayOfWeek;
  source_slot: MealSlot;
  target_day: DayOfWeek;
  target_slot: MealSlot;
  week_start: string;
}

export const useSwapMeals = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, SwapMealsData>({
    mutationFn: async (data) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/meal-plan/swap`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to swap meals');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan.all });
    },
  });
};

interface AddToShoppingListData {
  week_start: string;
  group_id?: number | null;
  pantry_group_id?: number;
}

export const useAddMealPlanToShoppingList = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ added_count: number; items: ShoppingListItem[] }, Error, AddToShoppingListData>({
    mutationFn: async (data) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/meal-plan/add-to-shopping-list`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add to shopping list');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mealPlan.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
    },
  });
};
