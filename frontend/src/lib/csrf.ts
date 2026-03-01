const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

export const getCsrfToken = (): string | null => {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }
  return null;
};

export const getCsrfHeaders = (existingHeaders: Record<string, string> = {}): Record<string, string> => {
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    return {
      ...existingHeaders,
      [CSRF_HEADER_NAME]: csrfToken,
    };
  }
  return existingHeaders;
};

export const secureFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const method = (options.method || 'GET').toUpperCase();
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

  if (stateChangingMethods.includes(method)) {
    options.headers = getCsrfHeaders((options.headers || {}) as Record<string, string>);
  }

  options.credentials = options.credentials || 'include';

  return fetch(url, options);
};

export { CSRF_HEADER_NAME };
