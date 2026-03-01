/**
 * useBudgetMutations.ts
 * React Query mutations for budget CRUD operations.
 * Exports useCreateBudget, useUpdateBudget, and useDeleteBudget.
 * Each mutation invalidates both the budgets and analytics query caches
 * on success so dependent views stay in sync.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';
import type { Budget } from '../../types';

interface CreateBudgetData {
  category: string;
  amount: number;
  month: number;
  year: number;
  recurring?: boolean;
  repeat_interval?: number;
  repeat_unit?: string;
}

interface UpdateBudgetVariables {
  id: number;
  data: Partial<CreateBudgetData>;
}

export const useCreateBudget = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<Budget, Error, CreateBudgetData>({
    mutationFn: async (budgetData: CreateBudgetData): Promise<Budget> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/budgets`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(budgetData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create budget');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};

export const useUpdateBudget = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<Budget, Error, UpdateBudgetVariables>({
    mutationFn: async ({ id, data }: UpdateBudgetVariables): Promise<Budget> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/budgets/${id}`, {
        method: 'PUT',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update budget');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};

export const useDeleteBudget = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (id: number): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/budgets/${id}`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete budget');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};
