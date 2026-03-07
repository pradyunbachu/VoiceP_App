/**
 * useExpenses.ts
 * React Query hook for fetching a paginated, filterable list of expenses.
 * Supports search, category filter, sorting, and an export-all flag.
 * Uses keepPreviousData so the UI does not flash empty between page transitions.
 */
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { PaginatedExpenses, ExpenseFilters } from '../../types';

export const useExpenses = (params: ExpenseFilters = {}) => {
  const { session } = useAuth();
  const { page, pageSize, search, category, sortBy, sortOrder, exportAll } = params;

  const filters: ExpenseFilters = { page, pageSize, search, category, sortBy, sortOrder, exportAll };

  return useQuery<PaginatedExpenses>({
    queryKey: queryKeys.expenses.list(filters),
    queryFn: async (): Promise<PaginatedExpenses> => {
      const urlParams = new URLSearchParams();
      if (page) urlParams.append('page', String(page));
      if (pageSize) urlParams.append('page_size', String(pageSize));
      if (search) urlParams.append('search', search);
      if (category) urlParams.append('category', category);
      if (sortBy) urlParams.append('sort_by', sortBy);
      if (sortOrder) urlParams.append('sort_order', sortOrder);
      if (exportAll) urlParams.append('export', 'true');

      const url = `${API_BASE_URL}/api/expenses${urlParams.toString() ? '?' + urlParams.toString() : ''}`;

      const response = await authFetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch expenses: ${response.status}`);
      }

      return response.json();
    },
    enabled: !!session,
    placeholderData: keepPreviousData,
  });
};
