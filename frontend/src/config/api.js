// API Configuration
// Uses VITE_API_URL environment variable if set, otherwise defaults based on environment
// - Development: http://localhost:8000
// - Production (Docker): empty string (nginx proxies /api to backend)

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
