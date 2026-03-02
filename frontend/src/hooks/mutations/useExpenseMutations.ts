/**
 * useExpenseMutations.ts
 * React Query mutations for the full expense lifecycle.
 * Exports useCreateExpense (AI extraction), useCreateExpenseSimple (fallback),
 * useUpdateExpense, useDeleteExpense, useBulkDeleteExpenses, and useClearAllExpenses.
 * All mutations invalidate both expenses and analytics caches on settle/success.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';
import type { Expense, ExpenseExtractionResult } from '../../types';

interface UpdateExpenseVariables {
  id: number;
  data: Partial<Omit<Expense, 'id'>>;
}

export const useCreateExpense = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<ExpenseExtractionResult, Error, string>({
    mutationFn: async (transcript: string): Promise<ExpenseExtractionResult> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/extract-expense`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ transcript }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create expense');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.streak.all });
    },
  });
};

export const useCreateExpenseSimple = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<ExpenseExtractionResult, Error, string>({
    mutationFn: async (transcript: string): Promise<ExpenseExtractionResult> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/extract-expense-simple`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ transcript }),
      });

      if (!response.ok) {
        throw new Error('Failed to create expense');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.streak.all });
    },
  });
};

export const useUpdateExpense = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<Expense, Error, UpdateExpenseVariables>({
    mutationFn: async ({ id, data }: UpdateExpenseVariables): Promise<Expense> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, {
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
        throw new Error(error.detail || 'Failed to update expense');
      }

      return response.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};

export const useDeleteExpense = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (id: number): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/expenses/${id}`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete expense');
      }

      return response.json();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};

export const useBulkDeleteExpenses = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number[]>({
    mutationFn: async (expenseIds: number[]): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/expenses/bulk`, {
        method: 'DELETE',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ expense_ids: expenseIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to bulk delete expenses');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};

export const useClearAllExpenses = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, void>({
    mutationFn: async (): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/expenses`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to clear all expenses');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};
