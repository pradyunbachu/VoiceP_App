import { useInfiniteQuery, keepPreviousData } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useInfiniteExpenses = (params = {}) => {
  const { getToken } = useAuth();
  const { search, category, sortBy, sortOrder, pageSize = 20 } = params;

  const filters = { search, category, sortBy, sortOrder, pageSize };

  return useInfiniteQuery({
    queryKey: queryKeys.expenses.infinite(filters),
    queryFn: async ({ pageParam = 1 }) => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const urlParams = new URLSearchParams();
      urlParams.append('page', pageParam);
      urlParams.append('page_size', pageSize);
      if (search) urlParams.append('search', search);
      if (category) urlParams.append('category', category);
      if (sortBy) urlParams.append('sort_by', sortBy);
      if (sortOrder) urlParams.append('sort_order', sortOrder);

      const response = await fetch(
        `${API_BASE_URL}/api/expenses?${urlParams.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.status === 401) throw new Error('Session expired');
      if (!response.ok) throw new Error(`Failed to fetch expenses: ${response.status}`);

      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.has_next ? allPages.length + 1 : undefined,
    enabled: !!getToken(),
    placeholderData: keepPreviousData,
  });
};
