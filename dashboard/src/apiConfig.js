/** Same origin as dashboard; file:// fallback for editor preview */
export const API =
  typeof window !== 'undefined' && window.location?.origin && !window.location.origin.startsWith('file')
    ? `${window.location.origin}/api`
    : 'http://localhost:4000/api';

export function apiFetch(url, options = {}) {
  return fetch(url, { credentials: 'include', ...options });
}

export async function fetchJson(url, options = {}) {
  const res = await apiFetch(url, options);
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(
      'Dashboard API returned HTML instead of JSON. Run `npm run dashboard` to start the API server on port 4000.'
    );
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
  return data;
}
