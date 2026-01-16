import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';

export const useCreateExpense = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (transcript) => {
      const token = getToken();
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
    },
  });
};

export const useCreateExpenseSimple = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (transcript) => {
      const token = getToken();
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
    },
  });
};

export const useUpdateExpense = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data }) => {
      const token = getToken();
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
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.expenses.list() });
      const previousExpenses = queryClient.getQueryData(queryKeys.expenses.list());

      queryClient.setQueryData(queryKeys.expenses.list(), (old) =>
        old?.map((expense) =>
          expense.id === id ? { ...expense, ...data } : expense
        )
      );

      return { previousExpenses };
    },
    onError: (err, variables, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(queryKeys.expenses.list(), context.previousExpenses);
      }
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

  return useMutation({
    mutationFn: async (id) => {
      const token = getToken();
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
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.expenses.list() });
      const previousExpenses = queryClient.getQueryData(queryKeys.expenses.list());

      queryClient.setQueryData(queryKeys.expenses.list(), (old) =>
        old?.filter((expense) => expense.id !== id)
      );

      return { previousExpenses };
    },
    onError: (err, id, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(queryKeys.expenses.list(), context.previousExpenses);
      }
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

  return useMutation({
    mutationFn: async (expenseIds) => {
      const token = getToken();
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

  return useMutation({
    mutationFn: async () => {
      const token = getToken();
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
      queryClient.setQueryData(queryKeys.expenses.list(), []);
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};
