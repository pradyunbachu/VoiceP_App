import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config/api';
import { queryKeys } from './queryKeys';
import { getCsrfHeaders } from '../../lib/csrf';

/**
 * Hook to check Google Calendar connection status
 */
export const useGoogleCalendarStatus = () => {
  const { getToken } = useAuth();

  return useQuery({
    queryKey: queryKeys.googleCalendar.status(),
    queryFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/google-calendar/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        throw new Error('Session expired');
      }

      if (!response.ok) {
        throw new Error('Failed to fetch Google Calendar status');
      }

      return response.json();
    },
    enabled: !!getToken(),
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
};

/**
 * Hook to get Google Calendar OAuth URL
 */
export const useGoogleCalendarAuthUrl = () => {
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/google-calendar/auth-url`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to get auth URL');
      }

      return response.json();
    },
  });
};

/**
 * Hook to exchange OAuth code for tokens
 */
export const useGoogleCalendarCallback = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async ({ code, state }) => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/google-calendar/callback`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify({ code, state }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to connect Google Calendar');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.googleCalendar.all });
    },
  });
};

/**
 * Hook to import events from Google Calendar
 */
export const useImportGoogleCalendarEvents = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async (options = {}) => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/google-calendar/import`, {
        method: 'POST',
        headers: getCsrfHeaders({
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }),
        credentials: 'include',
        body: JSON.stringify(options),
      });

      if (response.status === 401) {
        const error = await response.json();
        throw new Error(error.detail || 'Google Calendar not connected');
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to import events');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate calendar events to refresh the list
      queryClient.invalidateQueries({ queryKey: queryKeys.calendar.all });
    },
  });
};

/**
 * Hook to disconnect Google Calendar
 */
export const useDisconnectGoogleCalendar = () => {
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const token = getToken();
      if (!token) throw new Error('No authentication token');

      const response = await fetch(`${API_BASE_URL}/api/google-calendar/disconnect`, {
        method: 'DELETE',
        headers: getCsrfHeaders({ Authorization: `Bearer ${token}` }),
        credentials: 'include',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to disconnect');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.googleCalendar.all });
    },
  });
};
