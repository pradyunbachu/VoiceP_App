/**
 * useResetDemo.ts
 * React Query mutation that resets the caller's demo pantry.
 * Calls POST /api/pantry/demo/reset (no body); the backend wipes and re-seeds
 * the user's demo group and returns the seeded items. Invalidates all pantry
 * queries so the switched-to demo pantry re-renders with the fresh seed set.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from '../queries/queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';
import type { PantryItem } from '../../types';

interface ResetDemoResponse {
  message: string;
  group_id: number;
  items: PantryItem[];
}

export const useResetDemo = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation<ResetDemoResponse, Error, void>({
    mutationFn: async (): Promise<ResetDemoResponse> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/pantry/demo/reset`, {
        method: 'POST',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || 'Failed to reset demo pantry');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
    },
  });
};
