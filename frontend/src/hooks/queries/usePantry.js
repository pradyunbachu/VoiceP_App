/**
 * usePantry.js
 * React Query hooks for pantry data.
 * - usePantryItems: fetches a filterable, sortable list of pantry items
 *   (supports optional pagination). Returns items array or paginated response.
 * - usePantryStats: fetches aggregate pantry statistics from /api/pantry/stats.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const usePantryItems = (filters = {}) => {
  const { getToken } = useAuth();
  const { category, stock_status, sort_by = 'name', sort_order = 'asc', search, page, page_size, paginate } = filters;

  return useQuery({
    queryKey: queryKeys.pantry.items(filters),
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const params = new URLSearchParams();
      if (category) params.append('category', category);
      if (stock_status) params.append('stock_status', stock_status);
      if (search) params.append('search', search);
      if (paginate) params.append('paginate', 'true');
      if (page) params.append('page', page);
      if (page_size) params.append('page_size', page_size);
      params.append('sort_by', sort_by);
      params.append('sort_order', sort_order);

      const response = await fetch(`${API_BASE_URL}/api/pantry?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch pantry items');
      }

      const data = await response.json();
      if (paginate) {
        return data;
      }
      return data.items || [];
    },
    enabled: !!getToken(),
  });
};

export const usePantryStats = () => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.pantry.stats(),
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/pantry/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch pantry stats');
      }

      return response.json();
    },
    enabled: !!getToken(),
  });
};
