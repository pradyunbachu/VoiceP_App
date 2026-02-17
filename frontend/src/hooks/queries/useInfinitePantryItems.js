import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useInfinitePantryItems = (filters = {}) => {
  const { getToken } = useAuth();
  const {
    category,
    stock_status,
    search,
    sort_by = 'name',
    sort_order = 'asc',
    page_size = 20,
  } = filters;

  const queryFilters = { category, stock_status, search, sort_by, sort_order, page_size };

  return useInfiniteQuery({
    queryKey: queryKeys.pantry.infinite(queryFilters),
    queryFn: async ({ pageParam = 1 }) => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const params = new URLSearchParams();
      params.append('paginate', 'true');
      params.append('page', pageParam);
      params.append('page_size', page_size);
      if (category) params.append('category', category);
      if (stock_status) params.append('stock_status', stock_status);
      if (search) params.append('search', search);
      params.append('sort_by', sort_by);
      params.append('sort_order', sort_order);

      const response = await fetch(
        `${API_BASE_URL}/api/pantry?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.status === 401) throw new Error('Session expired');
      if (!response.ok) throw new Error('Failed to fetch pantry items');

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.has_next ? allPages.length + 1 : undefined,
    enabled: !!getToken(),
    placeholderData: keepPreviousData,
  });
};
