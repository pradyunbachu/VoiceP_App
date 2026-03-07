import { supabase } from './supabase';

export class SessionExpiredError extends Error {
  constructor() {
    super('Session expired');
    this.name = 'SessionExpiredError';
  }
}

/**
 * Fetch wrapper that auto-refreshes the Supabase token on 401.
 *
 * Flow:
 *  1. Get the current access token
 *  2. Make the request
 *  3. On 401 → refresh the session once and retry
 *  4. If refresh fails or second attempt is still 401 → throw SessionExpiredError
 */
export async function authFetch(
  input: string,
  init?: RequestInit
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) throw new SessionExpiredError();

  const response = await fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status !== 401) return response;

  // Attempt a token refresh
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    throw new SessionExpiredError();
  }

  // Retry once with the fresh token
  const retryResponse = await fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${data.session.access_token}`,
    },
  });

  if (retryResponse.status === 401) {
    throw new SessionExpiredError();
  }

  return retryResponse;
}

async function getAccessToken(): Promise<string | null> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;
  return session.access_token;
}
