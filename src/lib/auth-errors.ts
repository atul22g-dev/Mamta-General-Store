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
  // GoTrue throws a bare 500 when it cannot scan the stored user row —
  // which happens when a user row was hand-inserted via SQL with NULL token
  // columns (confirmation_token etc.) or a malformed password hash, instead
  // of being created via the dashboard or the admin API. The fix is running
  // supabase/create-admin-user.sql, the idempotent create-or-repair tool,
  // not retrying.
  if (
    m.includes('internal server error') ||
    m.includes('unexpected') ||
    m.includes('database error') ||
    m.includes('error:500') ||
    m.includes('500')
  )
    return 'Server error while signing in — this account\'s database row needs repair. Run supabase/create-admin-user.sql in the SQL Editor (see README), or delete and re-create the user in Dashboard → Authentication → Users.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error — check your connection.';
  return message || 'Sign-in failed. Please try again.';
}
