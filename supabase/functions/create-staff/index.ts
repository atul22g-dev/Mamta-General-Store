/**
 * create-staff edge function.
 *
 * Admin-only account provisioning: creates a Supabase Auth user with a
 * password (auto-confirmed) and grants the profile the 'staff' role.
 * The on_auth_user_created trigger (0001_profiles.sql) creates the profile
 * row; this function then sets its role (profiles default to NO role since
 * 0006_security_hardening.sql, so explicit grants are the only path).
 *
 * Auth: the caller's JWT must resolve to a profile with role='admin' —
 * the service-role client is used ONLY for admin.createUser and the role
 * grant, never before the caller is verified.
 *
 * Secrets: SUPABASE_SERVICE_ROLE_KEY (edge-only, never inside the app).
 * Deploy: supabase functions deploy create-staff --no-verify-jwt=false
 */

// STATIC npm specifier — see visual-match/index.ts: a dynamic import of a
// remote URL is absent from the deployed module graph and fails at runtime.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CreateStaffRequest {
  email: string;
  password: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    // --- AuthZ: caller must be a signed-in admin ---
    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userError } = await userClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (userError || !userData?.user) {
      return json({ error: 'Authentication required.' }, 401);
    }

    const { data: profile } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single();

    if (profile?.role !== 'admin') {
      return json({ error: 'Admin role required.' }, 403);
    }

    // --- Validate input (before any privileged call) ---
    const body = (await req.json()) as Partial<CreateStaffRequest>;
    const email = (body.email ?? '').trim().toLowerCase();
    const password = body.password ?? '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: 'Enter a valid email address.' }, 400);
    }
    if (password.length < 8) {
      return json({ error: 'Password must be at least 8 characters.' }, 400);
    }

    // --- Privileged work: create the auth user, then grant the role ---
    const serviceClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, // edge-only secret; bypasses RLS
    );

    const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // staff accounts are provisioned, not invited
    });

    if (createError) {
      const message = createError.message ?? 'Could not create the account.';
      const friendly = message.includes('already been registered')
        ? 'An account with this email already exists.'
        : message;
      return json({ error: friendly }, 400);
    }
    if (!created?.user) {
      return json({ error: 'Could not create the account.' }, 500);
    }

    // The trigger created the profile with role=NULL; grant 'staff' now.
    // `.select()` makes PostgREST return the affected rows so a grant that
    // matched ZERO rows (trigger missing/failed → no profile row) is
    // detectable — without it the function reported success while the new
    // account could never sign in.
    const { data: grantedRows, error: grantError } = await serviceClient
      .from('profiles')
      .update({ role: 'staff' })
      .eq('id', created.user.id)
      .select('id');

    if (grantError || !grantedRows || grantedRows.length === 0) {
      // The auth user exists but the profile row is missing (or the grant
      // failed) — report honestly so the admin can fix it via SQL rather
      // than silently pretending. Do NOT expose SQL to the client.
      console.error(
        `[create-staff] Role grant failed for user ${created.user.id}: ` +
          `${grantError?.message ?? 'no profile row'}`,
      );
      return json(
        {
          error:
            'Account created, but granting the staff role failed. ' +
            'Check the server logs and grant the role manually via SQL or the Dashboard.',
        },
        207,
      );
    }

    return json({ email, role: 'staff' }, 200);
  } catch {
    return json({ error: 'Unexpected server error. Try again.' }, 500);
  }
});
