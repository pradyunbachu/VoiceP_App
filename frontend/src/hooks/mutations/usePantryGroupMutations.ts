/**
 * usePantryGroupMutations.ts
 * React Query mutations for pantry group management.
 * Exports useCreatePantryGroup, useJoinPantryGroup,
 * useInviteToPantryGroup, useRemovePantryGroupMember, and useDeletePantryGroup.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';
import type { PantryGroup } from '../../types';

interface InviteToPantryGroupVariables {
  groupId: number;
  email: string;
}

interface RemovePantryGroupMemberVariables {
  groupId: number;
  userId: string;
}

export const useCreatePantryGroup = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<PantryGroup, Error, string>({
    mutationFn: async (name: string): Promise<PantryGroup> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/groups`, {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.groups() });
    },
  });
};

export const useJoinPantryGroup = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<PantryGroup, Error, string>({
    mutationFn: async (inviteCode: string): Promise<PantryGroup> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/groups/join`, {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.groups() });
    },
  });
};

export const useInviteToPantryGroup = () => {
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, InviteToPantryGroupVariables>({
    mutationFn: async ({ groupId, email }: InviteToPantryGroupVariables): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/groups/${groupId}/invite`, {
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

export const useRemovePantryGroupMember = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, RemovePantryGroupMemberVariables>({
    mutationFn: async ({ groupId, userId }: RemovePantryGroupMemberVariables): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/groups/${groupId}/members/${userId}`, {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.groups() });
    },
  });
};

export const useDeletePantryGroup = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: async (groupId: number): Promise<{ message: string }> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/groups/${groupId}`, {
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
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};
