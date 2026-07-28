// src/hooks/mutations/useChatMutation.ts
/**
 * useChatMutation.ts
 * React Query mutations for the Voxy agent: /api/chat and /api/chat/confirm.
 * Invalidates caches both by legacy intent (classifier fallback path) and by
 * the agent's performed `actions` (agent path returns intent "agent").
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { usePantrySelection } from '../../context/PantryContext';
import { API_BASE_URL } from '../../config/api';
import { getCsrfHeaders } from '../../lib/csrf';
import { SessionExpiredError } from '../../lib/authFetch';
import { queryKeys } from '../queries/queryKeys';
import { domainsForActions } from '../../lib/agentCacheKeys';
import type { ChatResponse, ChatTurn, PendingAction } from '../../types';

export interface ChatMutationInput {
  message: string;
  history?: ChatTurn[];
}

export interface ChatConfirmInput {
  ids: string[];
  pending: PendingAction[];
  history?: ChatTurn[];
}

async function postJSON(path: string, token: string | null, body: unknown): Promise<ChatResponse> {
  if (!token) throw new SessionExpiredError();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: getCsrfHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    }),
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'Chat request failed');
  }
  return response.json();
}

/** Invalidate caches affected by a chat/confirm result (by intent AND by actions). */
function invalidateForResult(queryClient: QueryClient, data: ChatResponse): void {
  const intent = data.intent;

  if (intent === 'shopping_complete' || intent === 'suggestion' ||
      intent === 'shopping_list_add' || intent === 'shopping_list_remove' || intent === 'shopping_clear') {
    queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all });
  }
  if (intent === 'pantry_add' || intent === 'pantry_remove' ||
      intent === 'cooking_deduct' || intent === 'shopping_complete') {
    queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all });
  }
  if (intent === 'budget_set') {
    queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all });
  }
  if (intent === 'expense_delete' || intent === 'mark_subscription') {
    queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.streak.all });
  }

  // Agent path: invalidate by performed actions.
  for (const domain of domainsForActions(data.actions ?? [])) {
    switch (domain) {
      case 'shopping': queryClient.invalidateQueries({ queryKey: queryKeys.shoppingList.all }); break;
      case 'pantry': queryClient.invalidateQueries({ queryKey: queryKeys.pantry.all }); break;
      case 'budgets': queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all }); break;
      case 'expenses':
        queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.streak.all });
        break;
    }
  }
}

export const useChat = () => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { selectedGroupId } = usePantrySelection();

  return useMutation<ChatResponse, Error, string | ChatMutationInput>({
    mutationFn: async (input): Promise<ChatResponse> => {
      const token = await getToken();
      const message = typeof input === 'string' ? input : input.message;
      const history = typeof input === 'string' ? [] : (input.history ?? []);
      return postJSON('/api/chat', token, { message, history, group_id: selectedGroupId ?? undefined });
    },
    onSuccess: (data) => invalidateForResult(queryClient, data),
  });
};

export const useChatConfirm = () => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { selectedGroupId } = usePantrySelection();

  return useMutation<ChatResponse, Error, ChatConfirmInput>({
    mutationFn: async ({ ids, pending, history }): Promise<ChatResponse> => {
      const token = await getToken();
      return postJSON('/api/chat/confirm', token, { ids, pending, history: history ?? [], group_id: selectedGroupId ?? undefined });
    },
    onSuccess: (data) => invalidateForResult(queryClient, data),
  });
};
