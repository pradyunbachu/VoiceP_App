/**
 * useChatMutation.js
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

export const useChat = () => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (message) => {
      const token = getToken();
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
    onSuccess: (data) => {
      // Invalidate shopping list cache when items might have been removed
      if (data.intent === 'shopping_complete' || data.intent === 'suggestion') {
        queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
      }
      // Invalidate pantry cache when items are added via voice
      if (data.intent === 'pantry_add') {
        queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
      }
      // Invalidate budget cache when a budget is set via voice
      if (data.intent === 'budget_set') {
        queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all });
      }
    },
  });
};
