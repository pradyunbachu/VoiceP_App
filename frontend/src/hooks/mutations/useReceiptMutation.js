/**
 * useReceiptMutation.js
 * React Query mutation for scanning a receipt image via /api/scan-receipt.
 * Accepts a base64-encoded image string, sends it for AI extraction, and
 * invalidates expenses + analytics caches on success so the new expense appears.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { getCsrfHeaders } from '../../lib/csrf';
import { queryKeys } from '../queries/queryKeys';

export const useScanReceipt = () => {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (imageBase64) => {
      const token = getToken();
      const response = await fetch(`${API_BASE_URL}/api/scan-receipt`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ image_base64: imageBase64 }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to scan receipt');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate expenses cache to show the new expense
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    },
  });
};
