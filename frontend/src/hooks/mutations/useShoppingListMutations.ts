/**
 * useShoppingListMutations.ts
 * React Query mutations for shopping list item operations.
 * Exports useCreateShoppingListItem, useUpdateShoppingListItem,
 * useDeleteShoppingListItem, useBulkDeleteShoppingListItems,
 * useClearShoppingList, and useRemovePurchasedItems.
 * All mutations invalidate the shopping list cache on success.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';
import type { ShoppingListItem } from '../../types';

type CreateShoppingListItemData = Omit<ShoppingListItem, 'id' | 'created_at'>;

interface UpdateShoppingListItemVariables {
  id: number;
  data: Partial<Omit<ShoppingListItem, 'id' | 'created_at'>>;
}

export const useCreateShoppingListItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<ShoppingListItem, Error, CreateShoppingListItemData>({
    mutationFn: async (itemData: CreateShoppingListItemData): Promise<ShoppingListItem> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list`, {
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
        throw new Error(error.detail || 'Failed to create shopping list item');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
    },
  });
};

export const useUpdateShoppingListItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<ShoppingListItem, Error, UpdateShoppingListItemVariables>({
    mutationFn: async ({ id, data }: UpdateShoppingListItemVariables): Promise<ShoppingListItem> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/${id}`, {
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
        throw new Error(error.detail || 'Failed to update shopping list item');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
    },
  });
};

export const useDeleteShoppingListItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (id: number): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/${id}`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete shopping list item');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
    },
  });
};

export const useBulkDeleteShoppingListItems = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number[]>({
    mutationFn: async (itemIds: number[]): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/bulk`, {
        method: 'DELETE',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ item_ids: itemIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to bulk delete shopping list items');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
    },
  });
};

export const useClearShoppingList = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, void>({
    mutationFn: async (): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/clear`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to clear shopping list');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
    },
  });
};

export const useRemovePurchasedItems = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, string>({
    mutationFn: async (itemsText: string): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/remove-purchased`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ items_text: itemsText }),
      });

      if (!response.ok) {
        throw new Error('Failed to remove purchased items');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
    },
  });
};
