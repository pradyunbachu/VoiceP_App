/**
 * useChatMutation.ts
 * React Query mutation for sending chat messages to /api/chat.
 * On success, selectively invalidates caches based on the returned intent
 * (e.g. shopping_complete, pantry_add, budget_set) so that side-effects
 * from voice/chat commands are immediately reflected in the UI.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { getCsrfHeaders } from '../../lib/csrf';
import { queryKeys } from '../queries/queryKeys';
import type { ChatResponse } from '../../types';

export const useChat = () => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation<ChatResponse, Error, string>({
    mutationFn: async (message: string): Promise<ChatResponse> => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/api/chat`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ message }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Chat request failed');
      }

      return response.json();
    },
    onSuccess: (data: ChatResponse) => {
      const intent = data.intent;

      // --- Shopping list mutations ---
      if (
        intent === 'shopping_complete' ||
        intent === 'suggestion' ||
        intent === 'shopping_list_add' ||
        intent === 'shopping_list_remove' ||
        intent === 'shopping_clear'
      ) {
        queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
      }

      // --- Pantry mutations ---
      if (
        intent === 'pantry_add' ||
        intent === 'pantry_remove' ||
        intent === 'cooking_deduct' ||
        intent === 'shopping_complete'
      ) {
        queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
      }

      // --- Budget mutations ---
      if (intent === 'budget_set') {
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all });
      }

      // --- Expense mutations ---
      if (intent === 'expense_delete' || intent === 'mark_subscription') {
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.streak.all });
      }
    },
  });
};
