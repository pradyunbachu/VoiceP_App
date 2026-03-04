/**
 * usePantryMutations.ts
 * React Query mutations for pantry CRUD and utility operations.
 * Exports useCreatePantryItem, useUpdatePantryItem, useUpdatePantryStatus,
 * useDeletePantryItem, useBulkDeletePantryItems, useResyncPantry, and useAddFromExpense.
 * useUpdatePantryItem and useUpdatePantryStatus use optimistic updates with
 * rollback on error across both flat-array and infinite-query cache shapes.
 */
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';
import type { PantryItem, PaginatedPantryItems, StockStatus } from '../../types';

type CreatePantryItemData = Omit<PantryItem, 'id'>;

interface UpdatePantryItemVariables {
  id: number;
  data: Partial<Omit<PantryItem, 'id'>>;
}

interface UpdatePantryStatusVariables {
  id: number;
  status: StockStatus;
}

interface AddFromExpenseVariables {
  expenseId: number;
  items: Array<{ name: string; category?: string; quantity?: number; unit?: string }>;
}

/** Union of cache shapes: flat array or infinite-query pages */
type PantryCacheData = PantryItem[] | InfiniteData<PaginatedPantryItems>;

interface OptimisticContext {
  previousData: Map<readonly unknown[], PantryCacheData>;
}

export const useCreatePantryItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<PantryItem, Error, CreatePantryItemData>({
    mutationFn: async (itemData: CreatePantryItemData): Promise<PantryItem> => {
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

  return useMutation<PantryItem, Error, UpdatePantryItemVariables, OptimisticContext>({
    mutationFn: async ({ id, data }: UpdatePantryItemVariables): Promise<PantryItem> => {
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
    onMutate: async ({ id, data }: UpdatePantryItemVariables): Promise<OptimisticContext> => {
      await queryClient.cancelQueries({ queryKey: ['pantry'] });

      const allQueries = queryClient.getQueryCache().findAll({
        predicate: (query) => query.queryKey[0] === 'pantry' && (query.queryKey[1] === 'items' || query.queryKey[1] === 'infinite'),
      });

      const previousData = new Map<readonly unknown[], PantryCacheData>();

      allQueries.forEach((query) => {
        const queryData = query.state.data as PantryCacheData | undefined;
        if (queryData && Array.isArray(queryData)) {
          previousData.set(query.queryKey, queryData);
          queryClient.setQueryData<PantryItem[]>(query.queryKey,
            queryData.map((item: PantryItem) => item.id === id ? { ...item, ...data } : item)
          );
        } else if (queryData && 'pages' in queryData) {
          previousData.set(query.queryKey, queryData);
          queryClient.setQueryData<InfiniteData<PaginatedPantryItems>>(query.queryKey, {
            ...queryData,
            pages: queryData.pages.map((page: PaginatedPantryItems) => ({
              ...page,
              items: page.items.map((item: PantryItem) => item.id === id ? { ...item, ...data } : item),
            })),
          });
        }
      });

      return { previousData };
    },
    onError: (_err: Error, _variables: UpdatePantryItemVariables, context?: OptimisticContext) => {
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

  return useMutation<PantryItem, Error, UpdatePantryStatusVariables, OptimisticContext>({
    mutationFn: async ({ id, status }: UpdatePantryStatusVariables): Promise<PantryItem> => {
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
    onMutate: async ({ id, status }: UpdatePantryStatusVariables): Promise<OptimisticContext> => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['pantry'] });

      // Get all pantry item queries and update them
      const allQueries = queryClient.getQueryCache().findAll({
        predicate: (query) => query.queryKey[0] === 'pantry' && (query.queryKey[1] === 'items' || query.queryKey[1] === 'infinite'),
      });

      const previousData = new Map<readonly unknown[], PantryCacheData>();

      allQueries.forEach((query) => {
        const data = query.state.data as PantryCacheData | undefined;
        if (data && Array.isArray(data)) {
          previousData.set(query.queryKey, data);
          queryClient.setQueryData<PantryItem[]>(query.queryKey,
            data.map((item: PantryItem) => item.id === id ? { ...item, stock_status: status } : item)
          );
        } else if (data && 'pages' in data) {
          previousData.set(query.queryKey, data);
          queryClient.setQueryData<InfiniteData<PaginatedPantryItems>>(query.queryKey, {
            ...data,
            pages: data.pages.map((page: PaginatedPantryItems) => ({
              ...page,
              items: page.items.map((item: PantryItem) => item.id === id ? { ...item, stock_status: status } : item),
            })),
          });
        }
      });

      return { previousData };
    },
    onError: (_err: Error, _variables: UpdatePantryStatusVariables, context?: OptimisticContext) => {
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

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (id: number): Promise<{ message: string }> => {
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

  return useMutation<{ message: string }, Error, number[]>({
    mutationFn: async (itemIds: number[]): Promise<{ message: string }> => {
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

export const useResyncPantry = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string; recategorized: number; merged: number; purchase_filled: number; expiration_filled: number; expiration_cleared: number }, Error, void>({
    mutationFn: async () => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/resync`, {
        method: 'POST',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to resync pantry');
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

  return useMutation<PantryItem[], Error, AddFromExpenseVariables>({
    mutationFn: async ({ expenseId, items }: AddFromExpenseVariables): Promise<PantryItem[]> => {
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
