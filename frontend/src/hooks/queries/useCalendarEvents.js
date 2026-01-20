import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';

export const useCalendarEvents = (month, year) => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.calendar.events({ month, year }),
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const params = new URLSearchParams();
      if (month !== undefined && month !== null) params.append('month', month);
      if (year !== undefined && year !== null) params.append('year', year);

      const url = `${API_BASE_URL}/api/calendar${params.toString() ? `?${params.toString()}` : ''}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch calendar events: ${response.status}`);
      }

      const data = await response.json();
      return data.events || [];
    },
    enabled: !!getToken(),
  });
};
