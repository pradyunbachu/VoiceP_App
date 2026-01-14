import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';

export const useCreatePantryItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (itemData) => {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update pantry item');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};

export const useUpdatePantryStatus = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ id, status }) => {
      const token = getToken();
      const response = await fetch(
        `${API_BASE_URL}/api/pantry/${id}/status?stock_status=${status}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};

export const useDeletePantryItem = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (id) => {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
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
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/bulk`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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

export const useAddFromExpense = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ expenseId, items }) => {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/from-expense`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
