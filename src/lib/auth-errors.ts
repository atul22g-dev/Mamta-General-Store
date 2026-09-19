/**
 * Maps Supabase auth failures to safe, human-facing messages.
 * Pure module (no imports) so it can be unit-tested directly.
 *
 * Security note: messages never leak whether the *email* or the *password*
 * was wrong, and never echo provider internals.
 */
export function toSignInError(message: string): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed')) return 'Email not confirmed — check your inbox.';
  if (m.includes('too many requests') || m.includes('over_request_rate_limit'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error — check your connection.';
  return message || 'Sign-in failed. Please try again.';
}
