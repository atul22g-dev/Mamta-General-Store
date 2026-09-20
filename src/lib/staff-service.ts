/**
 * Staff account provisioning — client side of the admin-only
 * `create-staff` edge function. The app NEVER holds the service-role key;
 * privileged account creation happens server-side where that secret lives.
 */
import { supabase } from '@/lib/supabase';
import type { ServiceResult } from '@/lib/products/product-service';

export type CreatedStaffAccount = {
  email: string;
  role: string;
};

/** Extract the friendly message from a FunctionsHttpError response body. */
async function toInvokeErrorMessage(error: unknown): Promise<string> {
  const status = (error as { status?: number }).status;
  // A missing function means provisioning was never deployed on this
  // Supabase project — the fix is a deploy, not a retry. The gateway
  // signals this with 404, sometimes with a parseable body.
  if (status === 404) {
    return 'The account service is not deployed on the server yet. Deploy it with: npx supabase functions deploy create-staff';
  }

  // Non-2xx responses arrive as FunctionsHttpError carrying the Response.
  const context = (error as { context?: Response }).context;
  if (context && typeof context.json === 'function') {
    try {
      const body = (await context.json()) as { error?: string; code?: string; message?: string };
      if (body?.code === 'NOT_FOUND' || body?.message?.includes('function was not found')) {
        return 'The account service is not deployed on the server yet. Deploy it with: npx supabase functions deploy create-staff';
      }
      if (body?.error) return body.error;
    } catch {
      // fall through to the generic message
    }
  }
  return 'Could not create the account. Please try again.';
}

/**
 * Create a staff account (email + password, auto-confirmed) via the
 * admin-only edge function. The caller's session JWT authorizes the
 * request; the function verifies the admin role server-side.
 */
export async function createStaffAccount(
  email: string,
  password: string,
): Promise<ServiceResult<CreatedStaffAccount>> {
  try {
    const { data, error } = await supabase.functions.invoke('create-staff', {
      body: { email: email.trim(), password },
    });

    if (error) {
      return { ok: false, error: await toInvokeErrorMessage(error) };
    }

    return {
      ok: true,
      data: {
        email: (data as { email?: string } | null)?.email ?? email.trim(),
        role: (data as { role?: string } | null)?.role ?? 'staff',
      },
    };
  } catch {
    return { ok: false, error: 'Network error — could not reach the account service.' };
  }
}
