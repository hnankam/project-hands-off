/**
 * Normalize auth/API error messages for user-friendly display.
 * Detects connectivity issues (Failed to fetch, network errors) and returns
 * clear, actionable messages.
 */

const CONNECTIVITY_MESSAGE =
  'Unable to connect to the server. Please check your internet connection and ensure the API server is running. You can verify the server URL in extension settings.';

/** Error patterns that indicate a connectivity/network issue */
const CONNECTIVITY_PATTERNS = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /fetch failed/i,
  /connection refused/i,
  /connection reset/i,
  /net::err_connection_refused/i,
  /net::err_connection_reset/i,
  /net::err_name_not_resolved/i,
  /net::err_timed_out/i,
  /failed to load resource/i,
  /cors/i,
  /cross-origin/i,
];

/**
 * Check if an error message indicates a connectivity issue
 */
export function isConnectivityError(message: string): boolean {
  const normalized = String(message || '').trim();
  if (!normalized) return false;
  return CONNECTIVITY_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * Convert raw error messages to user-friendly text.
 * Connectivity errors get a clear explanation; other errors pass through.
 */
export function formatAuthError(message: string | undefined | null): string {
  const raw = String(message || '').trim();
  if (!raw) return 'An unexpected error occurred';
  if (isConnectivityError(raw)) return CONNECTIVITY_MESSAGE;
  return raw;
}
