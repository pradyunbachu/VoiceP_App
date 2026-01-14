// API Configuration
// In development: uses localhost:8000
// In production (Docker): uses relative URLs (nginx proxies to backend)

const isDevelopment = import.meta.env.DEV;

export const API_BASE_URL = isDevelopment
  ? 'http://localhost:8000'
  : '';

export const getApiUrl = (path) => `${API_BASE_URL}${path}`;
