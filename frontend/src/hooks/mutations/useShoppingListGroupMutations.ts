/**
 * useShoppingListGroupMutations.ts
 * React Query mutations for shopping list group management.
 * Exports useCreateShoppingListGroup, useJoinShoppingListGroup,
 * useInviteToGroup, useRemoveGroupMember, and useDeleteShoppingListGroup.
 * Mutations invalidate the shopping list groups (or full shopping list)
 * cache on success to keep the UI in sync.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';
import type { ShoppingListGroup } from '../../types';

interface InviteToGroupVariables {
  groupId: number;
  email: string;
}

interface RemoveGroupMemberVariables {
  groupId: number;
  userId: string;
}

export const useCreateShoppingListGroup = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<ShoppingListGroup, Error, string>({
    mutationFn: async (name: string): Promise<ShoppingListGroup> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/groups`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create group');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.groups() });
    },
  });
};

export const useJoinShoppingListGroup = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<ShoppingListGroup, Error, string>({
    mutationFn: async (inviteCode: string): Promise<ShoppingListGroup> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/groups/join`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ invite_code: inviteCode }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to join group');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.groups() });
    },
  });
};

export const useInviteToGroup = () => {
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, InviteToGroupVariables>({
    mutationFn: async ({ groupId, email }: InviteToGroupVariables): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/groups/${groupId}/invite`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to invite user');
      }

      return response.json();
    },
  });
};

export const useRemoveGroupMember = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, RemoveGroupMemberVariables>({
    mutationFn: async ({ groupId, userId }: RemoveGroupMemberVariables): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/groups/${groupId}/members/${userId}`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to remove member');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.groups() });
    },
  });
};

export const useDeleteShoppingListGroup = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (groupId: number): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/shopping-list/groups/${groupId}`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete group');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
    },
  });
};
