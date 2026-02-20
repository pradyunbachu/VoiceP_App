/**
 * usePantryMutations.js
 * React Query mutations for pantry CRUD and utility operations.
 * Exports useCreatePantryItem, useUpdatePantryItem, useUpdatePantryStatus,
 * useDeletePantryItem, useBulkDeletePantryItems, useBackfillDates, and useAddFromExpense.
 * useUpdatePantryItem and useUpdatePantryStatus use optimistic updates with
 * rollback on error across both flat-array and infinite-query cache shapes.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';

export const useCreatePantryItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (itemData) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(itemData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create pantry item');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};

export const useUpdatePantryItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ id, data }) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/${id}`, {
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
        throw new Error(error.detail || 'Failed to update pantry item');
      }

      return response.json();
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['pantry'] });

      const allQueries = queryClient.getQueryCache().findAll({
        predicate: (query) => query.queryKey[0] === 'pantry' && (query.queryKey[1] === 'items' || query.queryKey[1] === 'infinite'),
      });

      const previousData = new Map();

      allQueries.forEach((query) => {
        const queryData = query.state.data;
        if (queryData && Array.isArray(queryData)) {
          previousData.set(query.queryKey, queryData);
          queryClient.setQueryData(query.queryKey,
            queryData.map((item) => item.id === id ? { ...item, ...data } : item)
          );
        } else if (queryData?.pages) {
          previousData.set(query.queryKey, queryData);
          queryClient.setQueryData(query.queryKey, {
            ...queryData,
            pages: queryData.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => item.id === id ? { ...item, ...data } : item),
            })),
          });
        }
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        context.previousData.forEach((data, queryKey) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['pantry'] });
    },
  });
};

export const useUpdatePantryStatus = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }) => {
      const token = await getToken();
      const response = await fetch(
        `${API_BASE_URL}/api/pantry/${id}/status?stock_status=${status}`,
        {
          method: 'PUT',
          headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
          credentials: 'include',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      return response.json();
    },
    onMutate: async ({ id, status }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['pantry'] });

      // Get all pantry item queries and update them
      const allQueries = queryClient.getQueryCache().findAll({
        predicate: (query) => query.queryKey[0] === 'pantry' && (query.queryKey[1] === 'items' || query.queryKey[1] === 'infinite'),
      });

      const previousData = new Map();

      allQueries.forEach((query) => {
        const data = query.state.data;
        if (data && Array.isArray(data)) {
          previousData.set(query.queryKey, data);
          queryClient.setQueryData(query.queryKey,
            data.map((item) => item.id === id ? { ...item, stock_status: status } : item)
          );
        } else if (data?.pages) {
          previousData.set(query.queryKey, data);
          queryClient.setQueryData(query.queryKey, {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item) => item.id === id ? { ...item, stock_status: status } : item),
            })),
          });
        }
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousData) {
        context.previousData.forEach((data, queryKey) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      // Refetch to ensure server state
      queryClient.invalidateQueries({ queryKey: ['pantry'] });
    },
  });
};

export const useDeletePantryItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (id) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/${id}`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete pantry item');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};

export const useBulkDeletePantryItems = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (itemIds) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/bulk`, {
        method: 'DELETE',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ item_ids: itemIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to bulk delete pantry items');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};

export const useBackfillDates = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/backfill-dates`, {
        method: 'POST',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to backfill dates');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};

export const useAddFromExpense = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ expenseId, items }) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/from-expense`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ expense_id: expenseId, items }),
      });

      if (!response.ok) {
        throw new Error('Failed to add items to pantry');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};
