/**
 * api.js — API base URL configuration.
 * Resolves the backend URL from the VITE_API_URL environment variable. Falls
 * back to localhost:8000 in development and an empty string in production
 * (where nginx reverse-proxies /api to the backend).
 */

const getBaseUrl = () => {
  // Check for explicit environment variable first
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Fall back to defaults based on environment
  return import.meta.env.DEV ? 'http://localhost:8000' : '';
};

export const API_BASE_URL = getBaseUrl();

export const getApiUrl = (path) => `${API_BASE_URL}${path}`;
