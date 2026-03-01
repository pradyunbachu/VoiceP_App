const getBaseUrl = (): string => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  return import.meta.env.DEV ? 'http://localhost:8000' : '';
};

export const API_BASE_URL: string = getBaseUrl();

export const getApiUrl = (path: string): string => `${API_BASE_URL}${path}`;
