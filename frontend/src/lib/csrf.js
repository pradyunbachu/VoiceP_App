// ============================================================================
// CSRF Token Management
// ============================================================================
// Handles CSRF token retrieval and storage for the double-submit cookie pattern.
// ============================================================================

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';

/**
 * Get the CSRF token from the cookie.
 * @returns {string|null} The CSRF token or null if not found
 */
export const getCsrfToken = () => {
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME) {
      return decodeURIComponent(value);
    }
  }
  return null;
};

/**
 * Get headers object with CSRF token included.
 * Use this for state-changing requests (POST, PUT, DELETE, PATCH).
 * @param {Object} existingHeaders - Existing headers to merge with
 * @returns {Object} Headers object with CSRF token
 */
export const getCsrfHeaders = (existingHeaders = {}) => {
  const csrfToken = getCsrfToken();
  if (csrfToken) {
    return {
      ...existingHeaders,
      [CSRF_HEADER_NAME]: csrfToken,
    };
  }
  return existingHeaders;
};

/**
 * Fetch wrapper that automatically includes CSRF token for state-changing requests.
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} The fetch response
 */
export const secureFetch = async (url, options = {}) => {
  const method = (options.method || 'GET').toUpperCase();
  const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];

  // Add CSRF token for state-changing requests
  if (stateChangingMethods.includes(method)) {
    options.headers = getCsrfHeaders(options.headers || {});
  }

  // Ensure credentials are included to send/receive cookies
  options.credentials = options.credentials || 'include';

  return fetch(url, options);
};

export { CSRF_HEADER_NAME };
