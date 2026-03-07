/**
 * useInfinitePantryItems.ts
 * React Query infinite-scroll hook for loading pantry items page-by-page.
 * Wraps useInfiniteQuery with category, stock status, search, and sort filters.
 * Uses keepPreviousData and resolves the next page from the `has_next` flag.
 */
import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { PaginatedPantryItems } from '../../types';

interface InfinitePantryFilters {
  category?: string;
  stock_status?: string;
  search?: string;
  sort_by?: string;
  sort_order?: string;
  page_size?: number;
  group_id?: number;
}

interface InfinitePantryPage extends PaginatedPantryItems {
  has_next: boolean;
}

export const useInfinitePantryItems = (filters: InfinitePantryFilters = {}) => {
  const { session } = useAuth();
  const {
    category,
    stock_status,
    search,
    sort_by = 'name',
    sort_order = 'asc',
    page_size = 20,
  } = filters;

  const queryFilters: InfinitePantryFilters = { category, stock_status, search, sort_by, sort_order, page_size };

  return useInfiniteQuery<InfinitePantryPage>({
    queryKey: queryKeys.pantry.infinite(queryFilters),
    queryFn: async ({ pageParam = 1 }): Promise<InfinitePantryPage> => {
      const params = new URLSearchParams();
      params.append('paginate', 'true');
      params.append('page', String(pageParam));
      params.append('page_size', String(page_size));
      if (filters.group_id != null) params.append('group_id', String(filters.group_id));
      if (category) params.append('category', category);
      if (stock_status) params.append('stock_status', stock_status);
      if (search) params.append('search', search);
      params.append('sort_by', sort_by);
      params.append('sort_order', sort_order);

      const response = await authFetch(
        `${API_BASE_URL}/api/pantry?${params.toString()}`
      );

      if (!response.ok) throw new Error('Failed to fetch pantry items');

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage: InfinitePantryPage, allPages: InfinitePantryPage[]) =>
      lastPage.has_next ? allPages.length + 1 : undefined,
    enabled: !!session,
    placeholderData: keepPreviousData,
  });
};
