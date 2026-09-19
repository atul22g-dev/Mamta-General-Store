/**
 * Plain-JS smoke test for auth logic that can run without TS runtime:
 *  1. sign-in error mapping (mirror of src/lib/auth-errors.ts)
 *  2. role gate truth table (mirror of (protected)/_layout.tsx)
 * Mirrors are kept in lockstep with the shipped source — if either drifts,
 * this test must be updated alongside it.
 */
let pass = 0;
let fail = 0;

function check(label, got, expected) {
  if (JSON.stringify(got) === JSON.stringify(expected)) {
    pass++;
  } else {
    fail++;
    console.log('FAIL:', label, '→ got', JSON.stringify(got), 'expected', JSON.stringify(expected));
  }
}

// --- 1. error mapping (mirror of toSignInError) ---
function toSignInError(message) {
  const m = (message ?? '').toLowerCase();
  if (m.includes('invalid login credentials')) return 'Incorrect email or password.';
  if (m.includes('email not confirmed')) return 'Email not confirmed — check your inbox.';
  if (m.includes('too many requests') || m.includes('over_request_rate_limit'))
    return 'Too many attempts. Please wait a moment and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error — check your connection.';
  return message || 'Sign-in failed. Please try again.';
}

check('bad credentials', toSignInError('Invalid login credentials'), 'Incorrect email or password.');
check('unconfirmed email', toSignInError('Email not confirmed'), 'Email not confirmed — check your inbox.');
check('rate limit', toSignInError('Too many requests'), 'Too many attempts. Please wait a moment and try again.');
check('network', toSignInError('TypeError: Network request failed'), 'Network error — check your connection.');
check('empty message', toSignInError(''), 'Sign-in failed. Please try again.');
check(
  'unknown message passes through',
  toSignInError('Something odd'),
  'Something odd',
);

// --- 2. role gate (mirror of ProtectedAdminLayout branching) ---
function guardRoute(status, isAdmin) {
  if (status === 'loading') return 'loading-gate';
  if (status === 'unauthenticated') return 'redirect:/admin/login';
  return isAdmin ? 'render-admin' : 'access-denied';
}

check('booting', guardRoute('loading', null), 'loading-gate');
check('anon', guardRoute('unauthenticated', null), 'redirect:/admin/login');
check('non-admin user', guardRoute('authenticated', false), 'access-denied');
check('admin user', guardRoute('authenticated', true), 'render-admin');

console.log(`auth smoke: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
