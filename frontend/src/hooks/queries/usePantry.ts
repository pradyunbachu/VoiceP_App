/**
 * usePantry.ts
 * React Query hooks for pantry data.
 * - usePantryItems: fetches a filterable, sortable list of pantry items
 *   (supports optional pagination). Returns items array or paginated response.
 * - usePantryStats: fetches aggregate pantry statistics from /api/pantry/stats.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../lib/authFetch';
import { queryKeys } from './queryKeys';
import type { PantryItem, PantryStats, PaginatedPantryItems } from '../../types';

interface PantryItemFilters {
  category?: string;
  stock_status?: string;
  sort_by?: string;
  sort_order?: string;
  search?: string;
  page?: number;
  page_size?: number;
  paginate?: boolean;
  group_id?: number;
}

export const usePantryItems = (filters: PantryItemFilters = {}) => {
  const { session } = useAuth();
  const { category, stock_status, sort_by = 'name', sort_order = 'asc', search, page, page_size, paginate } = filters;

  return useQuery<PantryItem[] | PaginatedPantryItems>({
    queryKey: queryKeys.pantry.items(filters),
    queryFn: async (): Promise<PantryItem[] | PaginatedPantryItems> => {
      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (stock_status) params.append('stock_status', stock_status);
      if (search) params.append('search', search);
      if (filters.group_id != null) params.append('group_id', String(filters.group_id));
      if (paginate) params.append('paginate', 'true');
      if (page) params.append('page', String(page));
      if (page_size) params.append('page_size', String(page_size));
      params.append('sort_by', sort_by);
      params.append('sort_order', sort_order);

      const response = await authFetch(`${API_BASE_URL}/api/pantry?${params.toString()}`);

      if (!response.ok) {
        throw new Error('Failed to fetch pantry items');
      }

      const data = await response.json();
      if (paginate) {
        return data as PaginatedPantryItems;
      }
      return (data.items || []) as PantryItem[];
    },
    enabled: !!session,
  });
};

export const usePantryStats = (groupId?: number) => {
  const { session } = useAuth();

  return useQuery<PantryStats>({
    queryKey: queryKeys.pantry.stats(groupId),
    queryFn: async (): Promise<PantryStats> => {
      const params = new URLSearchParams();
      if (groupId != null) params.append('group_id', String(groupId));
      const qs = params.toString();

      const response = await authFetch(`${API_BASE_URL}/api/pantry/stats${qs ? `?${qs}` : ''}`);

      if (!response.ok) {
        throw new Error('Failed to fetch pantry stats');
      }

      return response.json();
    },
    enabled: !!session,
  });
};
