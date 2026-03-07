/**
 * useInfiniteExpenses.ts
 * React Query infinite-scroll hook for loading expenses page-by-page.
 * Wraps useInfiniteQuery with search, category, and sort filters.
 * Automatically resolves the next page param from the `has_next` flag
 * and uses keepPreviousData for seamless filter transitions.
 */
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { PaginatedExpenses } from '../../types';

interface InfiniteExpenseParams {
  search?: string;
  category?: string;
  sortBy?: string;
  sortOrder?: string;
  pageSize?: number;
}

interface InfiniteExpensePage extends PaginatedExpenses {
  has_next: boolean;
}

export const useInfiniteExpenses = (params: InfiniteExpenseParams = {}) => {
  const { session } = useAuth();
  const { search, category, sortBy, sortOrder, pageSize = 20 } = params;

  const filters: InfiniteExpenseParams = { search, category, sortBy, sortOrder, pageSize };

  return useInfiniteQuery<InfiniteExpensePage>({
    queryKey: queryKeys.expenses.infinite(filters),
    queryFn: async ({ pageParam = 1 }): Promise<InfiniteExpensePage> => {
      const urlParams = new URLSearchParams();
      urlParams.append('page', String(pageParam));
      urlParams.append('page_size', String(pageSize));
      if (search) urlParams.append('search', search);
      if (category) urlParams.append('category', category);
      if (sortBy) urlParams.append('sort_by', sortBy);
      if (sortOrder) urlParams.append('sort_order', sortOrder);

      const response = await authFetch(
        `${API_BASE_URL}/api/expenses?${urlParams.toString()}`
      );

      if (!response.ok) throw new Error(`Failed to fetch expenses: ${response.status}`);

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: InfiniteExpensePage, allPages: InfiniteExpensePage[]) =>
      lastPage.has_next ? allPages.length + 1 : undefined,
    enabled: !!session,
    placeholderData: keepPreviousData,
  });
};
