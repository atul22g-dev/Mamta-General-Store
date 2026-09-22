/**
 * Friendly, human-safe error mapping shared by services and screens.
 * No new dependencies — network failures are detected from the error
 * shape (fetch TypeError / Supabase error codes).
 */

/**
 * Parses the JSON response body from a Supabase Edge Function error.
 * The `details` field is a stringified JSON like `{"error":"MODEL_URL not set"}`.
 * Returns the error message string, or null if unparseable.
 */
function parseEdgeFunctionError(details: string | undefined): string | null {
  if (!details || typeof details !== 'string') return null;
  try {
    const parsed = JSON.parse(details) as Record<string, unknown>;
    if (typeof parsed.error === 'string' && parsed.error.length > 0) return parsed.error;
    if (typeof parsed.message === 'string' && parsed.message.length > 0) return parsed.message;
  } catch {
    // Not JSON — return raw details if it looks like a message
    if (details.length > 0 && details.length < 300) return details;
  }
  return null;
}

/** Returns true when the error looks like a connectivity failure. */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch() network failure

  if (error && typeof error === 'object') {
    const anyError = error as { message?: string; code?: string };
    if (anyError.code === 'PGRST301' || anyError.code === 'ECONNABORTED') return true;
    if (typeof anyError.message === 'string') {
      const message = anyError.message.toLowerCase();
      return (
        message.includes('network') ||
        message.includes('fetch failed') ||
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('offline') ||
        message.includes('timed out') ||
        message.includes('timeout')
      );
    }
  }
  return false;
}

const NETWORK_MESSAGE = 'No internet connection. Check your network and try again.';

/**
 * Maps any thrown/returned error to a short user-facing message.
 * Never leaks stack traces, SQL, or auth internals.
 */
export function toUserMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isNetworkError(error)) return NETWORK_MESSAGE;

  if (error && typeof error === 'object') {
    const anyError = error as { message?: string; code?: string; details?: string };

    // PostgREST constraint violations and server errors → generic.
    if (anyError.code?.startsWith('23') || anyError.code?.startsWith('4')) {
      return fallback;
    }

    // Supabase FunctionsHttpError: the generic message is useless;
    // the actual error lives in `details` (JSON response body).
    if (
      typeof anyError.message === 'string' &&
      anyError.message.includes('Edge Function returned a non-2xx')
    ) {
      const details = parseEdgeFunctionError(anyError.details);
      if (details) return details;
    }

    if (typeof anyError.message === 'string' && anyError.message.length > 0) {
      // Already-friendly service messages pass through unchanged.
      return anyError.message;
    }
  }

  if (typeof error === 'string' && error.length > 0) return error;
  return fallback;
}

export { NETWORK_MESSAGE };
